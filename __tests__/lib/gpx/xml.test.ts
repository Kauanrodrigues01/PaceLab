import { describe, it, expect } from "vitest";
import { classifyActivityType, parseGpxXml } from "@/lib/gpx/xml";
import { GpxParseError } from "@/lib/gpx/types";

describe("lib/gpx/xml — Leitura, validação XML, namespaces e classificação de atividade (4.1)", () => {
  describe("classifyActivityType (D5)", () => {
    it("classifica variantes de corrida (texto e código numérico) como 'run'", () => {
      for (const raw of [
        "Run",
        "running",
        "TrailRun",
        "trail_run",
        "VirtualRun",
        "virtual-run",
        "treadmill_running",
        "indoor_running",
        "jogging",
        "Corrida",
        "Corrida de Trilha",
        "Corrida na esteira",
        "9",
        "53",
      ]) {
        expect(classifyActivityType(raw)).toBe("run");
      }
    });

    it("classifica variantes de caminhada/trilha (texto e código numérico) como 'walk'", () => {
      for (const raw of [
        "Walk",
        "walking",
        "casualWalking",
        "indoor_walking",
        "speed-walking",
        "power_walking",
        "nordicWalking",
        "treadmill_walking",
        "Hike",
        "hiking",
        "Caminhada",
        "Caminhada leve",
        "Trilha",
        "10",
        "4",
      ]) {
        expect(classifyActivityType(raw)).toBe("walk");
      }
    });

    it("classifica outros esportes reconhecidos (ciclismo, natação, etc.) como 'other'", () => {
      for (const raw of ["Ride", "cycling", "VirtualRide", "1", "swim", "swimming", "16", "yoga"]) {
        expect(classifyActivityType(raw)).toBe("other");
      }
    });

    it("classifica tag ausente, vazia ou desconhecida como 'unknown'", () => {
      expect(classifyActivityType(null)).toBe("unknown");
      expect(classifyActivityType("")).toBe("unknown");
      expect(classifyActivityType("   ")).toBe("unknown");
      expect(classifyActivityType("custom_unknown_sport_999")).toBe("unknown");
    });
  });

  describe("parseGpxXml — estrutura, extensões e erros tipados", () => {
    it("lê GPX 1.1 padrão do Strava com prefixo gpxtpx: e múltiplos trkseg", () => {
      const xml = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>\r\n
<gpx creator="StravaGPX" version="1.1"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Corrida Matinal no Parque</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="-23.587410" lon="-46.657630">
        <ele>760.4</ele>
        <time>2026-11-13T09:15:00Z</time>
        <extensions>
          <power>240</power>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:atemp>24</gpxtpx:atemp>
            <gpxtpx:hr>152</gpxtpx:hr>
            <gpxtpx:cad>86</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="-23.587500" lon="-46.657700">
        <ele>761.0</ele>
        <time>2026-11-13T09:16:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

      const res = parseGpxXml(xml);
      expect(res.name).toBe("Corrida Matinal no Parque");
      expect(res.rawType).toBe("running");
      expect(res.sourceActivityKind).toBe("run");
      expect(res.segments).toHaveLength(2);
      expect(res.rawTimedPointCount).toBe(2);
      expect(res.firstRawTimestampIso).toBe("2026-11-13T09:15:00.000Z");
      expect(res.lastRawTimestampIso).toBe("2026-11-13T09:16:00.000Z");

      const p0 = res.segments[0].points[0];
      expect(p0.lat).toBeCloseTo(-23.58741, 6);
      expect(p0.lon).toBeCloseTo(-46.65763, 6);
      expect(p0.elevationM).toBeCloseTo(760.4, 2);
      expect(p0.heartRateBpm).toBe(152);
      expect(p0.cadenceRaw).toBe(86);
      expect(p0.temperatureC).toBe(24);
      expect(p0.powerW).toBe(240);
    });

    it("lê extensões sem prefixo de namespace (<hr>, <cad>, <atemp>) e ignora FC fora de 30..250 bpm", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <type>9</type>
    <trkseg>
      <trkpt lat="-4.225810" lon="-38.730120">
        <time>2026-11-13T09:15:00Z</time>
        <extensions>
          <TrackPointExtension>
            <hr>164</hr>
            <cad>88</cad>
            <atemp>27.5</atemp>
          </TrackPointExtension>
        </extensions>
      </trkpt>
      <trkpt lat="-4.225900" lon="-38.730200">
        <time>2026-11-13T09:15:01Z</time>
        <extensions>
          <hr>295</hr>
          <cad>90</cad>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

      const res = parseGpxXml(xml);
      expect(res.sourceActivityKind).toBe("run");
      expect(res.segments[0].points[0].heartRateBpm).toBe(164);
      expect(res.segments[0].points[0].cadenceRaw).toBe(88);
      expect(res.segments[0].points[0].temperatureC).toBe(27.5);
      // FC 295 > 250 é descartada como inválida
      expect(res.segments[0].points[1].heartRateBpm).toBeNull();
      expect(res.segments[0].points[1].cadenceRaw).toBe(90);
    });

    it("lança INVALID_XML para XML quebrado ou contendo declarações de entidades (proteção XXE/billion laughs)", () => {
      expect(() => parseGpxXml("<gpx><trk><unclosed></gpx>")).toThrowError(GpxParseError);
      try {
        parseGpxXml("<gpx><trk><unclosed></gpx>");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("INVALID_XML");
      }

      const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol">]>
<gpx><trk><trkseg><trkpt lat="0" lon="0"><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`;
      try {
        parseGpxXml(xxeXml);
        expect.fail("Deveria rejeitar <!ENTITY");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("INVALID_XML");
      }
    });

    it("lança NO_TRACKPOINTS quando não há <trk> ou <trkpt> válidos", () => {
      try {
        parseGpxXml(`<?xml version="1.0"?><gpx version="1.1"></gpx>`);
        expect.fail("Deveria lançar NO_TRACKPOINTS");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("NO_TRACKPOINTS");
      }

      try {
        parseGpxXml(
          `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>`
        );
        expect.fail("Deveria lançar NO_TRACKPOINTS");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("NO_TRACKPOINTS");
      }
    });

    it("descarta pontos sem <time> com warning e lança NO_TIMESTAMPS se nenhum ponto tiver <time>", () => {
      const noTimeXml = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
        <trkpt lat="-23.5" lon="-46.6"><ele>700</ele></trkpt>
      </trkseg></trk></gpx>`;

      try {
        parseGpxXml(noTimeXml);
        expect.fail("Deveria lançar NO_TIMESTAMPS");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("NO_TIMESTAMPS");
      }

      const partialTimeXml = `<?xml version="1.0"?><gpx version="1.1"><trk><type>running</type><trkseg>
        <trkpt lat="-23.5" lon="-46.6"><ele>700</ele></trkpt>
        <trkpt lat="-23.501" lon="-46.6"><time>2026-11-13T09:00:00Z</time></trkpt>
      </trkseg></trk></gpx>`;

      const parsed = parseGpxXml(partialTimeXml);
      expect(parsed.segments[0].points).toHaveLength(1);
      expect(parsed.skippedMissingTimeCount).toBe(1);
      expect(parsed.warnings.some((w) => w.code === "MISSING_TIMESTAMPS_SKIPPED")).toBe(true);
    });

    it("lança UNSUPPORTED_ACTIVITY para ciclismo ou natação e TOO_MANY_POINTS quando excede o limite", () => {
      const rideXml = `<?xml version="1.0"?><gpx version="1.1"><trk><type>cycling</type><trkseg>
        <trkpt lat="-23.5" lon="-46.6"><time>2026-11-13T09:00:00Z</time></trkpt>
      </trkseg></trk></gpx>`;

      try {
        parseGpxXml(rideXml);
        expect.fail("Deveria lançar UNSUPPORTED_ACTIVITY");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("UNSUPPORTED_ACTIVITY");
      }

      const twoPtsXml = `<?xml version="1.0"?><gpx version="1.1"><trk><type>running</type><trkseg>
        <trkpt lat="-23.5" lon="-46.6"><time>2026-11-13T09:00:00Z</time></trkpt>
        <trkpt lat="-23.501" lon="-46.6"><time>2026-11-13T09:00:01Z</time></trkpt>
      </trkseg></trk></gpx>`;

      try {
        parseGpxXml(twoPtsXml, { maxTrackPoints: 1 });
        expect.fail("Deveria lançar TOO_MANY_POINTS");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("TOO_MANY_POINTS");
      }
    });

    it("descarta coordenadas fora de faixa [-90..90, -180..180] com warning OUT_OF_RANGE_COORDS_SKIPPED e rejeita XML vazio ou sem <gpx>", () => {
      try {
        parseGpxXml("   ");
        expect.fail("Deveria rejeitar XML vazio");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("INVALID_XML");
      }

      try {
        parseGpxXml(`<?xml version="1.0"?><notgpx></notgpx>`);
        expect.fail("Deveria rejeitar sem <gpx>");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("INVALID_XML");
      }

      const outOfRangeXml = `<?xml version="1.0"?><gpx version="1.1"><trk><type>running</type><trkseg>
        <trkpt lat="120.0" lon="-46.6"><time>2026-11-13T09:00:00Z</time></trkpt>
        <trkpt lat="-23.5" lon="-46.6"><time>2026-11-13T09:00:01Z</time></trkpt>
      </trkseg></trk></gpx>`;

      const res = parseGpxXml(outOfRangeXml);
      expect(res.skippedInvalidCoordCount).toBe(1);
      expect(res.warnings.some((w) => w.code === "OUT_OF_RANGE_COORDS_SKIPPED")).toBe(true);

      const allInvalidCoordsXml = `<?xml version="1.0"?><gpx version="1.1"><trk><type>running</type><trkseg>
        <trkpt lat="999" lon="-46.6"><time>2026-11-13T09:00:00Z</time></trkpt>
      </trkseg></trk></gpx>`;
      try {
        parseGpxXml(allInvalidCoordsXml);
        expect.fail("Deveria lançar NO_TRACKPOINTS");
      } catch (e) {
        expect((e as GpxParseError).code).toBe("NO_TRACKPOINTS");
      }
    });
  });
});
