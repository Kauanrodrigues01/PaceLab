import { describe, it, expect } from "vitest";
import { computeGpxExternalId, GPX_HASH_VERSION } from "@/lib/gpx/externalId";
import { parseGpxXml } from "@/lib/gpx/xml";

describe("lib/gpx/externalId — Hash determinístico SHA-256 baseado em dados brutos (4.8 & D4)", () => {
  it("exporta constante GPX_HASH_VERSION = 'v1'", () => {
    expect(GPX_HASH_VERSION).toBe("v1");
  });

  it("teste golden: gera hash fixo determinístico para entrada conhecida", () => {
    // sha256("2026-11-13T09:00:00.000Z|2026-11-13T09:25:00.000Z|1501")
    const externalId = computeGpxExternalId({
      firstTimestampIso: "2026-11-13T09:00:00.000Z",
      lastTimestampIso: "2026-11-13T09:25:00.000Z",
      rawPointCount: 1501,
    });

    expect(externalId).toBe(
      "gpx_3f68838305aaf6f9569d885f6d25f9abf12cbc75e4df5960fd12f134a5513433"
    );
  });

  it("produz o mesmo externalId mesmo se atributos XML forem reordenados ou <name> for alterado", () => {
    const xmlA = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StravaGPX">
  <trk>
    <name>Corrida Matinal Original</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="-23.587410" lon="-46.657630"><ele>760</ele><time>2026-11-13T09:00:00Z</time></trkpt>
      <trkpt lat="-23.587500" lon="-46.657700"><ele>762</ele><time>2026-11-13T09:05:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    const xmlB = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="OutroExportador" version="1.1">
  <trk>
    <name>Título Renomeado pelo Atleta</name>
    <type>Run</type>
    <trkseg>
      <trkpt lon="-46.657630" lat="-23.587410"><time>2026-11-13T09:00:00.000Z</time><ele>999</ele></trkpt>
      <trkpt lon="-46.657700" lat="-23.587500"><time>2026-11-13T09:05:00.000Z</time><ele>888</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    const parsedA = parseGpxXml(xmlA);
    const parsedB = parseGpxXml(xmlB);

    const idA = computeGpxExternalId({
      firstTimestampIso: parsedA.firstRawTimestampIso,
      lastTimestampIso: parsedA.lastRawTimestampIso,
      rawPointCount: parsedA.rawTrackPointCount,
    });
    const idB = computeGpxExternalId({
      firstTimestampIso: parsedB.firstRawTimestampIso,
      lastTimestampIso: parsedB.lastRawTimestampIso,
      rawPointCount: parsedB.rawTrackPointCount,
    });

    expect(idA).toBe(idB);
  });

  it("altera o externalId quando o timestamp ou a contagem de pontos muda", () => {
    const base = computeGpxExternalId({
      firstTimestampIso: "2026-11-13T09:00:00.000Z",
      lastTimestampIso: "2026-11-13T09:25:00.000Z",
      rawPointCount: 1501,
    });
    const diffCount = computeGpxExternalId({
      firstTimestampIso: "2026-11-13T09:00:00.000Z",
      lastTimestampIso: "2026-11-13T09:25:00.000Z",
      rawPointCount: 1502,
    });
    const diffTime = computeGpxExternalId({
      firstTimestampIso: "2026-11-13T09:00:01.000Z",
      lastTimestampIso: "2026-11-13T09:25:00.000Z",
      rawPointCount: 1501,
    });

    expect(base).not.toBe(diffCount);
    expect(base).not.toBe(diffTime);
  });
});
