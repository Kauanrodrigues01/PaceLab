import { describe, it, expect, vi, beforeEach } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { POST as postParseActivity } from "@/app/api/training-sessions/parse-activity/route";
import { POST as postGpxPreviewAlias } from "@/app/api/taf/trainings/gpx-preview/route";
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

function buildFitBuffer(options: {
  session?: Record<string, unknown>;
  laps?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
}): Buffer {
  const enc = new Encoder();
  enc.onMesg(
    Profile.MesgNum.FILE_ID,
    {
      type: "activity",
      manufacturer: "garmin",
      product: 1,
      timeCreated: new Date("2026-11-12T06:00:00Z"),
    } as never
  );

  for (const rec of options.records ?? []) {
    enc.onMesg(Profile.MesgNum.RECORD, rec as never);
  }

  for (const lap of options.laps ?? []) {
    enc.onMesg(Profile.MesgNum.LAP, lap as never);
  }

  if (options.session) {
    enc.onMesg(Profile.MesgNum.SESSION, options.session as never);
  }

  enc.onMesg(
    Profile.MesgNum.ACTIVITY,
    {
      timestamp: new Date("2026-11-12T06:30:00Z"),
      numSessions: options.session ? 1 : 0,
    } as never
  );

  return Buffer.from(enc.close());
}

const VALID_GPX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>2026-11-12T06:00:10Z</time>
  </metadata>
  <trk>
    <name>Rodagem Leve no Ibirapuera</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="-23.587416" lon="-46.657634">
        <ele>750.0</ele>
        <time>2026-11-12T06:00:10Z</time>
      </trkpt>
      <trkpt lat="-23.586516" lon="-46.657634">
        <ele>756.0</ele>
        <time>2026-11-12T06:00:40Z</time>
      </trkpt>
      <trkpt lat="-23.585616" lon="-46.657634">
        <ele>763.0</ele>
        <time>2026-11-12T06:01:10Z</time>
      </trkpt>
      <trkpt lat="-23.584716" lon="-46.657634">
        <ele>771.0</ele>
        <time>2026-11-12T06:01:40Z</time>
      </trkpt>
      <trkpt lat="-23.583816" lon="-46.657634">
        <ele>779.0</ele>
        <time>2026-11-12T06:02:10Z</time>
      </trkpt>
      <trkpt lat="-23.582916" lon="-46.657634">
        <ele>788.0</ele>
        <time>2026-11-12T06:02:40Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

function buildMultipartRequest(
  url: string,
  entries: Array<{
    fieldName?: string;
    fileName: string;
    content: Buffer | Uint8Array | string;
    mimeType?: string;
    overrideSizeBytes?: number;
  }>
): Request {
  const filesMap = new Map<string, unknown[]>();

  for (const item of entries) {
    const field = item.fieldName ?? "files";
    const buf =
      typeof item.content === "string"
        ? Buffer.from(item.content, "utf8")
        : Buffer.from(item.content);
    const fakeFile = {
      name: item.fileName,
      size: item.overrideSizeBytes ?? buf.byteLength,
      type: item.mimeType ?? "application/octet-stream",
      arrayBuffer: async () =>
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
    const arr = filesMap.get(field) ?? [];
    arr.push(fakeFile);
    filesMap.set(field, arr);
  }

  const fakeFormData = {
    getAll: (key: string) => filesMap.get(key) ?? [],
  } as unknown as FormData;

  return {
    url,
    method: "POST",
    formData: async () => fakeFormData,
  } as unknown as Request;
}

describe("POST /api/training-sessions/parse-activity & /api/taf/trainings/gpx-preview (Fase 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValue(null);
  });

  it("processa upload de apenas 1 arquivo .FIT com sucesso (200) e retorna telemetria oficial", async () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1520,
        totalDistance: 5000,
        sport: "running",
        avgHeartRate: 162,
        maxHeartRate: 180,
        avgCadence: 87,
        totalAscent: 32,
        totalCalories: 370,
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "treino_garmin.fit", content: fitBuf }]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("fit_upload");
    expect(json.data.filesUsed).toEqual(["fit"]);
    expect(json.data.distanceKm).toBe(5);
    expect(json.data.durationSeconds).toBe(1500);
    expect(json.data.elapsedSeconds).toBe(1520);
    expect(json.data.paceFormatted).toBe("5:00");
    expect(json.data.avgHeartRate).toBe(162);
    expect(json.data.maxHeartRate).toBe(180);
    expect(json.data.avgCadence).toBe(174);
    expect(json.data.elevationGainM).toBe(32);
    expect(json.data.activeCalories).toBe(370);
    expect(json.data.name).toBeNull();
    expect(json.data.suggestedNotes).toBe("treino garmin");
    expect(json.data.titleSource).toBe("filename");
    expect(json.data.alreadyExists).toBe(false);
    expect(json.data.existingTrainingId).toBeNull();
    expect(json.data.suggestedActivityType).toBe("corrida_continua");
    expect(json.data.allowedActivityTypes).toEqual([
      "rodagem_leve",
      "corrida_continua",
      "tempo_run",
      "corrida_intervalada",
      "longao",
    ]);
  });

  it("processa upload de apenas 1 arquivo .GPX com sucesso (200) via rota principal e alias gpx-preview", async () => {
    const req = buildMultipartRequest(
      "http://localhost/api/taf/trainings/gpx-preview",
      [{ fieldName: "file", fileName: "strava.gpx", content: VALID_GPX_XML }]
    );

    const res = await postGpxPreviewAlias(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("gpx_upload");
    expect(json.data.filesUsed).toEqual(["gpx"]);
    expect(json.data.name).toBe("Rodagem Leve no Ibirapuera");
    expect(json.data.suggestedNotes).toBe("Rodagem Leve no Ibirapuera");
    expect(json.data.titleSource).toBe("metadata");
    expect(json.data.externalId).toMatch(/^gpx_[a-f0-9]{64}$/);
  });

  it("processa upload combinado (.FIT + .GPX do mesmo treino): aplica prioridade do .FIT e mescla <trk><name> e elevação do .GPX", async () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1800,
        totalElapsedTime: 1830,
        totalDistance: 6000,
        sport: "running",
        avgHeartRate: 158,
        maxHeartRate: 175,
        avgCadence: 86,
        totalAscent: 0, // zero no .FIT -> complementa com elevação do .GPX
        totalCalories: 410,
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [
        { fileName: "atividade.fit", content: fitBuf },
        { fileName: "atividade.gpx", content: VALID_GPX_XML },
      ]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.source).toBe("fit_upload");
    expect(json.data.filesUsed).toEqual(["fit", "gpx"]);
    expect(json.data.distanceKm).toBe(6);
    expect(json.data.durationSeconds).toBe(1800);
    expect(json.data.name).toBe("Rodagem Leve no Ibirapuera");
    expect(json.data.suggestedNotes).toBe("Rodagem Leve no Ibirapuera");
    expect(json.data.titleSource).toBe("metadata");
    expect(json.data.elevationGainM).toBeGreaterThan(15);
    expect(json.data.activeCalories).toBe(410);
  });

  it("retorna warning MISMATCHED_ACTIVITY_FILES quando .FIT e .GPX têm diferença de horário inicial > 5 min", async () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T09:00:00Z"), // 3 horas depois do GPX
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
        totalAscent: 20,
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [
        { fileName: "treino1.fit", content: fitBuf },
        { fileName: "treino2.gpx", content: VALID_GPX_XML },
      ]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.warnings.some(
        (w: { code: string }) => w.code === "MISMATCHED_ACTIVITY_FILES"
      )
    ).toBe(true);
  });

  it("sinaliza alreadyExists=true e existingTrainingId quando o externalId já consta no banco", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce({
      id: "trn-ja-importado-99",
    } as never);

    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "duplicado.fit", content: fitBuf }]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.alreadyExists).toBe(true);
    expect(json.data.existingTrainingId).toBe("trn-ja-importado-99");
    expect(json.data.alreadyExistsAttempt).toBe(false);
    expect(json.data.existingAttemptId).toBeNull();
  });

  it("retorna 400 MISSING_FILE quando nenhum arquivo é enviado", async () => {
    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      []
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.details).toEqual({ code: "MISSING_FILE" });
  });

  it("retorna 422 INVALID_EXTENSION quando o arquivo não é .fit nem .gpx", async () => {
    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "planilha.xlsx", content: "conteudo qualquer" }]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.details).toMatchObject({ code: "INVALID_EXTENSION" });
  });

  it("retorna 413 FILE_TOO_LARGE quando um arquivo excede 4 MB", async () => {
    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [
        {
          fileName: "gigante.fit",
          content: "abc",
          overrideSizeBytes: 4 * 1024 * 1024 + 10,
        },
      ]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(413);
    expect(json.success).toBe(false);
    expect(json.details).toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("retorna 422 UNSUPPORTED_ACTIVITY quando o .FIT é de ciclismo, sem vazar stack trace", async () => {
    const cyclingFit = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 3600,
        totalElapsedTime: 3600,
        totalDistance: 30000,
        sport: "cycling",
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "pedal.fit", content: cyclingFit }]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.details).toMatchObject({ code: "UNSUPPORTED_ACTIVITY" });
    expect("stack" in json).toBe(false);
  });

  it("retorna 422 EMPTY_FILE quando um arquivo nomeado está vazio (0 bytes) e ignora slot opcional sem nome", async () => {
    const emptyNamedReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "vazio.fit", content: Buffer.alloc(0) }]
    );

    const emptyRes = await postParseActivity(emptyNamedReq);
    const emptyJson = await emptyRes.json();

    expect(emptyRes.status).toBe(422);
    expect(emptyJson.details).toMatchObject({ code: "EMPTY_FILE" });

    // Quando fitFile é válido e gpxFile é um slot vazio de formulário (name="", size=0), processa o .FIT normalmente
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
      },
    });

    const withOptionalEmptySlotReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [
        { fieldName: "fitFile", fileName: "treino.fit", content: fitBuf },
        { fieldName: "gpxFile", fileName: "", content: Buffer.alloc(0) },
      ]
    );

    const okRes = await postParseActivity(withOptionalEmptySlotReq);
    const okJson = await okRes.json();

    expect(okRes.status).toBe(200);
    expect(okJson.data.source).toBe("fit_upload");
    expect(okJson.data.filesUsed).toEqual(["fit"]);
  });

  it("expõe tafWindow de 12 min e sinaliza duplicidade cruzada independente (TrainingSession vs TafAttempt)", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValueOnce({
      id: "att-ja-importado-42",
    } as never);

    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 720,
        totalElapsedTime: 720,
        totalDistance: 2520,
        sport: "running",
        avgHeartRate: 171,
        maxHeartRate: 186,
      },
    });

    const req = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "cooper.fit", content: fitBuf }]
    );

    const res = await postParseActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.alreadyExists).toBe(false);
    expect(json.data.existingTrainingId).toBeNull();
    expect(json.data.alreadyExistsAttempt).toBe(true);
    expect(json.data.existingAttemptId).toBe("att-ja-importado-42");
    expect(json.data.tafWindow).toMatchObject({
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2520,
      isShorterThanTarget: false,
      avgHeartRate: 171,
      maxHeartRate: 186,
    });
    expect(Array.isArray(json.data.tafWindow.laps)).toBe(true);
    expect(json.data.tafWindow.laps.length).toBeGreaterThanOrEqual(6);
  });

  it("ignora ID numérico puro em arquivo .FIT para titleSource/suggestedNotes e usa nome descritivo quando válido (Fase 2)", async () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "walking",
      },
    });

    const numericReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "1234567890.fit", content: fitBuf }]
    );
    const numericRes = await postParseActivity(numericReq);
    const numericJson = await numericRes.json();

    expect(numericRes.status).toBe(200);
    expect(numericJson.data.name).toBeNull();
    expect(numericJson.data.suggestedNotes).toBe("");
    expect(numericJson.data.titleSource).toBeNull();

    const gpxWithoutName = VALID_GPX_XML.replace(
      "<name>Rodagem Leve no Ibirapuera</name>",
      ""
    );
    const combinedReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [
        { fileName: "1234567890.fit", content: fitBuf },
        { fileName: "Caminhada_no_parque.gpx", content: gpxWithoutName },
      ]
    );
    const combinedRes = await postParseActivity(combinedReq);
    const combinedJson = await combinedRes.json();

    expect(combinedRes.status).toBe(200);
    expect(combinedJson.data.name).toBeNull();
    expect(combinedJson.data.suggestedNotes).toBe("Caminhada no parque");
    expect(combinedJson.data.titleSource).toBe("filename");
  });

  it("infere suggestedActivityType corretamente ('caminhada' vs 'corrida_continua') quando o arquivo tem modalidade generic/unknown", async () => {
    const genericSlowWalkFit = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1800,
        totalElapsedTime: 1800,
        totalDistance: 2500, // 5.0 km/h (pace 12:00/km)
        sport: "generic",
      },
    });

    const walkReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "atividade_001.fit", content: genericSlowWalkFit }]
    );
    const walkRes = await postParseActivity(walkReq);
    const walkJson = await walkRes.json();

    expect(walkRes.status).toBe(200);
    expect(walkJson.data.sourceActivityKind).toBe("unknown");
    expect(walkJson.data.suggestedActivityType).toBe("caminhada");
    expect(walkJson.data.allowedActivityTypes).toContain("caminhada");
    expect(walkJson.data.allowedActivityTypes).toContain("corrida_continua");
    expect(
      walkJson.data.warnings.some(
        (w: { code: string }) => w.code === "UNKNOWN_ACTIVITY_TYPE"
      )
    ).toBe(true);

    const genericRunFit = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T07:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000, // 12.0 km/h
        sport: "generic",
      },
    });
    const runReq = buildMultipartRequest(
      "http://localhost/api/training-sessions/parse-activity",
      [{ fileName: "atividade_002.fit", content: genericRunFit }]
    );
    const runRes = await postParseActivity(runReq);
    const runJson = await runRes.json();

    expect(runRes.status).toBe(200);
    expect(runJson.data.sourceActivityKind).toBe("unknown");
    expect(runJson.data.suggestedActivityType).toBe("corrida_continua");
  });
});
