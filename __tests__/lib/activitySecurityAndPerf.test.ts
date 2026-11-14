import { describe, it, expect, vi, beforeEach } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { parseGpx } from "@/lib/gpx/parseGpx";
import { parseFit } from "@/lib/fit/parseFit";
import { extractBestTafWindow } from "@/lib/activityParser/window";
import { POST as postParseActivity } from "@/app/api/training-sessions/parse-activity/route";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainingSession: {
      findUnique: vi.fn(),
    },
    tafAttempt: {
      findUnique: vi.fn(),
    },
  },
}));

function buildLargeGpx(numPoints: number): string {
  const startMs = Date.parse("2026-11-12T06:00:00Z");
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk><name>Treino Grande Benchmark</name><type>running</type><trkseg>",
  ];

  // ~3.5 m/s por ponto (~0.0000315 deg de latitude por segundo)
  for (let i = 0; i < numPoints; i++) {
    const lat = (-23.587416 + i * 0.0000315).toFixed(6);
    const ts = new Date(startMs + i * 1000).toISOString();
    lines.push(
      `    <trkpt lat="${lat}" lon="-46.657634"><ele>750</ele><time>${ts}</time></trkpt>`
    );
  }

  lines.push("  </trkseg></trk></gpx>");
  return lines.join("\n");
}

function createMultipartRequest(
  entries: Array<{
    name: string;
    content: string | Buffer;
    type?: string;
    spoofSizeBytes?: number;
  }>
): Request {
  const filesList: unknown[] = [];

  for (const entry of entries) {
    const buf =
      typeof entry.content === "string"
        ? Buffer.from(entry.content, "utf8")
        : entry.content;
    filesList.push({
      name: entry.name,
      size: entry.spoofSizeBytes ?? buf.byteLength,
      type: entry.type ?? "application/octet-stream",
      arrayBuffer: async () =>
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    });
  }

  const fakeFormData = {
    getAll: (key: string) => (key === "files" ? filesList : []),
  } as unknown as FormData;

  return {
    url: "http://localhost:3000/api/training-sessions/parse-activity",
    method: "POST",
    headers: new Headers({ "content-type": "multipart/form-data; boundary=test" }),
    formData: async () => fakeFormData,
  } as unknown as Request;
}

describe("Segurança, Sanitização e Performance de Parsing (.GPX / .FIT)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValue(null);
  });

  it("rejeita payload XXE / DOCTYPE / Billion Laughs sem expandir entidades", async () => {
    const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE gpx [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;">
  <!ENTITY secret SYSTEM "file:///etc/passwd">
]>
<gpx version="1.1">
  <trk><name>&secret;</name><type>running</type>
    <trkseg>
      <trkpt lat="-23.587" lon="-46.657"><time>2026-11-12T06:00:00Z</time></trkpt>
      <trkpt lat="-23.586" lon="-46.657"><time>2026-11-12T06:01:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    expect(() => parseGpx(xxePayload)).toThrow(/DTD\/ENTITY/i);

    const req = createMultipartRequest([
      { name: "xxe.gpx", content: xxePayload, type: "application/gpx+xml" },
    ]);
    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toContain("/etc/passwd");
    expect(JSON.stringify(json)).not.toContain("at parseGpx");
  });

  it("sanitiza scripts HTML e caracteres de controle em <name> do .GPX e workoutName do .FIT", () => {
    const gpxWithScript = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name><![CDATA[<script>alert("xss")</script>Corrida\u0000 <b>Matinal</b>]]></name>
    <type>running</type>
    <trkseg>
      <trkpt lat="-23.587416" lon="-46.657634"><time>2026-11-12T06:00:00Z</time></trkpt>
      <trkpt lat="-23.586416" lon="-46.657634"><time>2026-11-12T06:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    const parsedGpx = parseGpx(gpxWithScript);
    expect(parsedGpx.name).toBe("Corrida Matinal");
    expect(parsedGpx.name).not.toContain("<script>");

    const enc = new Encoder();
    enc.onMesg(Profile.MesgNum.FILE_ID, {
      type: "activity",
      manufacturer: "garmin",
      product: 1,
      timeCreated: new Date("2026-11-12T06:00:00Z"),
    } as never);
    enc.onMesg(Profile.MesgNum.WORKOUT, {
      wktName: "<script>evil()</script>Treino Pista\u0007",
      sport: "running",
    } as never);
    enc.onMesg(Profile.MesgNum.SESSION, {
      sport: "running",
      startTime: new Date("2026-11-12T06:00:00Z"),
      totalElapsedTime: 600,
      totalTimerTime: 600,
      totalDistance: 2000,
    } as never);
    enc.onMesg(Profile.MesgNum.ACTIVITY, {
      timestamp: new Date("2026-11-12T06:10:00Z"),
      numSessions: 1,
    } as never);

    const parsedFit = parseFit(Buffer.from(enc.close()));
    expect(parsedFit.name).toBe("Treino Pista");
    expect(parsedFit.name).not.toContain("<script>");
  });

  it("rejeita extensões maliciosas, arquivo vazio, payload acima de 4 MB (mesmo com file.size forjado), excesso de pontos e .FIT corrompido sem stack trace", async () => {
    // 1. Extensão não permitida (.exe)
    const exeRes = await postParseActivity(
      createMultipartRequest([{ name: "payload.exe", content: "MZ..." }])
    );
    expect(exeRes.status).toBe(422);
    const exeJson = await exeRes.json();
    expect(exeJson.success).toBe(false);

    // 2. Arquivo vazio
    const emptyRes = await postParseActivity(
      createMultipartRequest([{ name: "vazio.gpx", content: "" }])
    );
    expect(emptyRes.status).toBe(422);

    // 3. Payload > 4 MB -> 413 Payload Too Large (inclusive testando buffer real mesmo com size falsificado)
    const oversizedBuf = Buffer.alloc(4 * 1024 * 1024 + 128, 0x41);
    const largeRes = await postParseActivity(
      createMultipartRequest([
        { name: "gigante.fit", content: oversizedBuf, spoofSizeBytes: 1024 },
      ])
    );
    expect(largeRes.status).toBe(413);
    const largeJson = await largeRes.json();
    expect(largeJson.details?.code).toBe("FILE_TOO_LARGE");

    // 4. .FIT binário corrompido / truncado
    const corruptFit = Buffer.from([
      0x0e, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54,
      0xff, 0xff, 0xaa,
    ]);
    const corruptRes = await postParseActivity(
      createMultipartRequest([{ name: "corrompido.fit", content: corruptFit }])
    );
    expect(corruptRes.status).toBe(422);
    const corruptJson = await corruptRes.json();
    expect(corruptJson.success).toBe(false);
    expect(JSON.stringify(corruptJson)).not.toMatch(/\bat\s+[A-Za-z0-9_./]+\(/);

    // 5. Excesso de trackpoints no parser XML
    const overLimitGpx = buildLargeGpx(50);
    expect(() => parseGpx(overLimitGpx, { maxTrackPoints: 10 })).toThrow(
      /limite máximo permitido/i
    );
  });

  it("processa arquivo .GPX grande (10.000 pontos) e extrai melhor janela TAF rapidamente", () => {
    const gpx10k = buildLargeGpx(10_000);
    const t0 = performance.now();
    const parsed = parseGpx(gpx10k);
    const elapsedMs = performance.now() - t0;

    expect(parsed.pointCount).toBe(10_000);
    expect(parsed.tafWindow).not.toBeNull();
    expect(parsed.tafWindow?.actualDurationSeconds).toBe(720);
    expect(elapsedMs).toBeLessThan(3000);

    // Verifica escalabilidade O(N) direta da janela deslizante em 20.000 amostras
    const samples = Array.from({ length: 20_000 }, (_, i) => ({
      elapsedSec: i,
      distanceM: i * 3.6,
      heartRateBpm: 165,
    }));
    const w0 = performance.now();
    const best = extractBestTafWindow(samples);
    const windowMs = performance.now() - w0;

    expect(best?.distanceMeters).toBeGreaterThan(2500);
    expect(windowMs).toBeLessThan(200);
  });
});
