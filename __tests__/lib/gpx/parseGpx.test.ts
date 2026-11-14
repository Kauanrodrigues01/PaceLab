import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parseGpx, gpxParserService, GpxParseError, isGpxParseError } from "@/lib/gpx";
import { CreateTrainingSessionSchema } from "@/lib/validations/taf";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures/gpx");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

describe("lib/gpx/parseGpx — Testes de Integração nas Fixtures Sintéticas e Propriedades (4.9 & 4.10)", () => {
  it("run_5k_even.gpx: 5.000m em 1500s (1 Hz) => 5,000 km, pace 5:00, 12,00 km/h, FC 150/150, cad 170, 5 splits de 300s", () => {
    const res = gpxParserService.parseGpx(readFixture("run_5k_even.gpx"));

    expect(res.name).toBe("Corrida 5K Ritmo Constante");
    expect(res.rawType).toBe("running");
    expect(res.sourceActivityKind).toBe("run");
    expect(res.startedAt).toBe("2026-11-13T09:00:00.000Z");
    expect(res.distanceKm).toBe(5);
    expect(res.durationSeconds).toBe(1500);
    expect(res.elapsedSeconds).toBe(1500);
    expect(res.speedKmh).toBe(12);
    expect(res.paceSeconds).toBe(300);
    expect(res.paceFormatted).toBe("5:00");
    expect(res.avgHeartRate).toBe(150);
    expect(res.maxHeartRate).toBe(150);
    expect(res.avgCadence).toBe(170);
    expect(res.elevationGainM).toBe(0);
    expect(res.avgTemperatureC).toBe(24);
    expect(res.pointCount).toBe(1501);
    expect(res.externalId).toBe(
      "gpx_3f68838305aaf6f9569d885f6d25f9abf12cbc75e4df5960fd12f134a5513433"
    );

    expect(res.splits).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(res.splits[i]).toMatchObject({
        kilometer: i + 1,
        distanceKm: 1,
        durationSeconds: 300,
        paceSeconds: 300,
        paceFormatted: "5:00",
        avgHeartRate: 150,
        elevationDiffM: 0,
      });
    }
  });

  it("run_two_segments_pause.gpx: 2 trkseg de 2.000m com pausa de 120s e salto de 500m entre eles => 4,000 km, mov 1200s, elapsed 1320s", () => {
    const res = parseGpx(readFixture("run_two_segments_pause.gpx"));

    expect(res.distanceKm).toBe(4);
    expect(res.durationSeconds).toBe(1200);
    expect(res.elapsedSeconds).toBe(1320);
    expect(res.paceFormatted).toBe("5:00");
    expect(res.splits).toHaveLength(4);
    expect(res.debug.segmentCount).toBe(2);
    expect(res.warnings.some((w) => w.code === "MULTIPLE_SEGMENTS_DETECTED")).toBe(true);
  });

  it("run_stationary_inside_segment.gpx: 5km + 60s parado no mesmo trkseg => mov 1500s, elapsed 1560s, dist 5,000 km", () => {
    const res = parseGpx(readFixture("run_stationary_inside_segment.gpx"));

    expect(res.distanceKm).toBe(5);
    expect(res.durationSeconds).toBe(1500);
    expect(res.elapsedSeconds).toBe(1560);
    expect(res.paceFormatted).toBe("5:00");
    expect(res.debug.stationaryPairsCount).toBeGreaterThan(0);
  });

  it("run_5420m_residual.gpx: 5.420m a 5:00/km => 5 splits de 300s + residual 0,420 km / 126s / 5:00 e invariantes de soma", () => {
    const res = parseGpx(readFixture("run_5420m_residual.gpx"));

    expect(res.distanceKm).toBe(5.42);
    expect(res.durationSeconds).toBe(1626);
    expect(res.splits).toHaveLength(6);
    expect(res.splits[5]).toMatchObject({
      kilometer: 6,
      distanceKm: 0.42,
      durationSeconds: 126,
      paceSeconds: 300,
      paceFormatted: "5:00",
    });

    const sumSplitDuration = res.splits.reduce((acc, s) => acc + s.durationSeconds, 0);
    const sumSplitDist = res.splits.reduce((acc, s) => acc + s.distanceKm, 0);
    expect(Math.abs(sumSplitDuration - res.durationSeconds)).toBeLessThanOrEqual(1);
    expect(Math.abs(sumSplitDist - res.distanceKm)).toBeLessThanOrEqual(0.01);
  });

  it("run_no_ele_no_hr.gpx: sem <ele> e sem extensões => elevationGainM, FC e cadência null sem erro", () => {
    const res = parseGpx(readFixture("run_no_ele_no_hr.gpx"));

    expect(res.distanceKm).toBe(3);
    expect(res.elevationGainM).toBeNull();
    expect(res.avgHeartRate).toBeNull();
    expect(res.maxHeartRate).toBeNull();
    expect(res.avgCadence).toBeNull();
    expect(res.avgTemperatureC).toBeNull();
    expect(res.warnings.some((w) => w.code === "NO_ELEVATION_DATA")).toBe(true);
    expect(res.warnings.some((w) => w.code === "NO_HEART_RATE_DATA")).toBe(true);
    expect(res.warnings.some((w) => w.code === "NO_CADENCE_DATA")).toBe(true);
  });

  it("run_hr_cad_half.gpx e run_hr_cad_full.gpx: cad 85 dobra para 170 spm; cad 170 permanece 170 spm (A8)", () => {
    const half = parseGpx(readFixture("run_hr_cad_half.gpx"));
    const full = parseGpx(readFixture("run_hr_cad_full.gpx"));

    expect(half.avgCadence).toBe(170);
    expect(half.warnings.some((w) => w.code === "CADENCE_DOUBLED")).toBe(true);
    expect(full.avgCadence).toBe(170);
    expect(full.warnings.some((w) => w.code === "CADENCE_DOUBLED")).toBe(false);
  });

  it("run_no_prefix_namespace.gpx: lê <hr> e <cad> sem prefixo gpxtpx:", () => {
    const res = parseGpx(readFixture("run_no_prefix_namespace.gpx"));

    expect(res.avgHeartRate).toBe(162);
    expect(res.maxHeartRate).toBe(162);
    expect(res.avgCadence).toBe(176); // 88 * 2
  });

  it("run_elevation_staircase.gpx (+10m) e run_elevation_noise_flat.gpx (ruído ±0,4m => 0m)", () => {
    const staircase = parseGpx(readFixture("run_elevation_staircase.gpx"));
    const flatNoise = parseGpx(readFixture("run_elevation_noise_flat.gpx"));

    expect(staircase.elevationGainM).not.toBeNull();
    expect(staircase.elevationGainM!).toBeGreaterThanOrEqual(9);
    expect(staircase.elevationGainM!).toBeLessThanOrEqual(11);
    expect(flatNoise.elevationGainM).toBe(0);
  });

  it("run_gps_spike.gpx e run_duplicate_timestamps.gpx: descarta anomalias com warning sem inflar distância nem gerar NaN", () => {
    const spike = parseGpx(readFixture("run_gps_spike.gpx"));
    expect(spike.distanceKm).toBe(2);
    expect(spike.durationSeconds).toBe(600);
    expect(spike.debug.discardedSpikeCount).toBe(1);
    expect(spike.warnings.some((w) => w.code === "GPS_SPIKE_SKIPPED")).toBe(true);

    const dup = parseGpx(readFixture("run_duplicate_timestamps.gpx"));
    expect(dup.distanceKm).toBe(2);
    expect(dup.durationSeconds).toBe(600);
    expect(dup.debug.discardedNonPositiveDeltaCount).toBe(1);
    expect(dup.warnings.some((w) => w.code === "NON_POSITIVE_DELTA_TIME_SKIPPED")).toBe(true);
  });

  it("type_run_variants, type_walk_variants e type_unknown classificam corretamente a família (D5)", () => {
    const runNum = parseGpx(readFixture("type_run_variants.gpx"));
    expect(runNum.rawType).toBe("9");
    expect(runNum.sourceActivityKind).toBe("run");

    const walk = parseGpx(readFixture("type_walk_variants.gpx"));
    expect(walk.rawType).toBe("walking");
    expect(walk.sourceActivityKind).toBe("walk");
    expect(walk.paceFormatted).toBe("10:00");

    const unknown = parseGpx(readFixture("type_unknown.gpx"));
    expect(unknown.rawType).toBeNull();
    expect(unknown.sourceActivityKind).toBe("unknown");
    expect(unknown.warnings.some((w) => w.code === "UNKNOWN_ACTIVITY_TYPE")).toBe(true);
  });

  it("ride_type, swim_type, invalid_xml, no_trkpt e no_time lançam GpxParseError com o código esperado", () => {
    const cases: Array<[string, string]> = [
      ["ride_type.gpx", "UNSUPPORTED_ACTIVITY"],
      ["swim_type.gpx", "UNSUPPORTED_ACTIVITY"],
      ["invalid_xml.gpx", "INVALID_XML"],
      ["no_trkpt.gpx", "NO_TRACKPOINTS"],
      ["no_time.gpx", "NO_TIMESTAMPS"],
    ];

    for (const [fixture, expectedCode] of cases) {
      try {
        parseGpx(readFixture(fixture));
        expect.fail(`Fixture ${fixture} deveria lançar ${expectedCode}`);
      } catch (err) {
        expect(err).toBeInstanceOf(GpxParseError);
        expect((err as GpxParseError).code).toBe(expectedCode);
      }
    }
  });

  it("propriedades (4.10 & D8): idempotência, suporte a BOM/CRLF e ignorância total de tag <calories> no XML", () => {
    const xmlClean = readFixture("run_hr_cad_half.gpx");

    const xmlWithBomCrlfAndFakeCalories =
      "\uFEFF" +
      xmlClean
        .replace(/<extensions>/g, "<extensions><calories>9999</calories>")
        .replace(/\n/g, "\r\n");

    const resA = parseGpx(xmlClean);
    const resB = parseGpx(xmlWithBomCrlfAndFakeCalories);

    expect(resA.externalId).toBe(resB.externalId);
    expect(resA.distanceKm).toBe(resB.distanceKm);
    expect(resA.durationSeconds).toBe(resB.durationSeconds);
    expect("calories" in resB).toBe(false);
    expect("activeCalories" in resB).toBe(false);
    expect("totalCalories" in resB).toBe(false);
  });

  it("contrato ponta a ponta: a saída de parseGpx de todas as fixtures válidas passa sem erros pelo CreateTrainingSessionSchema", () => {
    const validFixtures = [
      "run_5k_even.gpx",
      "run_two_segments_pause.gpx",
      "run_stationary_inside_segment.gpx",
      "run_5420m_residual.gpx",
      "run_no_ele_no_hr.gpx",
      "run_hr_cad_half.gpx",
      "run_hr_cad_full.gpx",
      "run_no_prefix_namespace.gpx",
      "run_elevation_staircase.gpx",
      "run_elevation_noise_flat.gpx",
      "run_gps_spike.gpx",
      "run_duplicate_timestamps.gpx",
      "type_run_variants.gpx",
      "type_walk_variants.gpx",
      "type_unknown.gpx",
    ];

    for (const fixture of validFixtures) {
      const parsed = parseGpx(readFixture(fixture));
      const zodRes = CreateTrainingSessionSchema.safeParse({
        source: "gpx_upload",
        externalId: parsed.externalId,
        sessionDate: parsed.startedAt,
        activityType:
          parsed.sourceActivityKind === "walk" ? "caminhada" : "corrida_continua",
        distanceKm: parsed.distanceKm,
        durationSeconds: parsed.durationSeconds,
        elapsedSeconds: parsed.elapsedSeconds,
        speedKmh: parsed.speedKmh,
        paceSeconds: parsed.paceSeconds,
        paceFormatted: parsed.paceFormatted,
        avgHeartRate: parsed.avgHeartRate,
        maxHeartRate: parsed.maxHeartRate,
        elevationGainM: parsed.elevationGainM,
        avgCadence: parsed.avgCadence,
        notes: parsed.name,
        splits: parsed.splits,
      });

      expect(zodRes.success, `Falha Zod na fixture ${fixture}`).toBe(true);
    }
  });

  it("bateria Strava Real (strava-real/Voltando.gpx — Sub-fase 5.5): reproduz fielmente os valores da tela do Strava e valida no schema Zod", () => {
    const realDir = path.join(FIXTURES_DIR, "strava-real");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(realDir, "strava-reference.json"), "utf8")
    ) as Record<
      string,
      {
        scenario: string;
        stravaScreen: {
          distanceKm: number;
          movingSeconds: number;
          elapsedSeconds: number;
          paceFormatted?: string;
          paceSeconds?: number;
          avgHeartRate: number | null;
          avgCadence: number | null;
          elevationGainM: number;
          splits?: Array<{
            kilometer: number;
            paceFormatted: string;
            paceSeconds: number;
          }>;
        };
      }
    >;

    for (const [fileName, meta] of Object.entries(manifest)) {
      const xml = fs.readFileSync(path.join(realDir, fileName), "utf8");
      const parsed = parseGpx(xml);
      const ref = meta.stravaScreen;

      const distDiffPct =
        Math.abs((parsed.distanceKm - ref.distanceKm) / ref.distanceKm) * 100;
      expect(distDiffPct).toBeLessThanOrEqual(1.0);

      // Formato truncado em 2 casas decimais do Strava bate exatamente (1,87 km)
      const stravaTruncated2Dec = Math.floor(parsed.distanceKm * 100) / 100;
      expect(stravaTruncated2Dec).toBeCloseTo(ref.distanceKm, 2);

      const movDiffPct =
        (Math.abs(parsed.durationSeconds - ref.movingSeconds) / ref.movingSeconds) *
        100;
      expect(movDiffPct).toBeLessThanOrEqual(2.0);
      expect(parsed.durationSeconds).toBe(ref.movingSeconds);

      expect(Math.abs(parsed.elapsedSeconds - ref.elapsedSeconds)).toBeLessThanOrEqual(
        2
      );

      if (ref.paceFormatted) {
        expect(parsed.paceFormatted).toBe(ref.paceFormatted);
      }

      if (ref.avgHeartRate === null) {
        expect(parsed.avgHeartRate).toBeNull();
      } else {
        expect(parsed.avgHeartRate).not.toBeNull();
        expect(
          Math.abs(parsed.avgHeartRate! - ref.avgHeartRate)
        ).toBeLessThanOrEqual(2);
      }

      if (ref.avgCadence === null) {
        expect(parsed.avgCadence).toBeNull();
      } else {
        expect(parsed.avgCadence).not.toBeNull();
        expect(
          Math.abs(parsed.avgCadence! - ref.avgCadence)
        ).toBeLessThanOrEqual(2);
      }

      const actualEle = parsed.elevationGainM ?? 0;
      const eleDiff = Math.abs(actualEle - ref.elevationGainM);
      expect(actualEle).toBe(ref.elevationGainM);
      if (ref.elevationGainM === 0) {
        expect(eleDiff).toBeLessThanOrEqual(1.0);
      } else {
        expect(
          eleDiff <= 2.0 || (eleDiff / ref.elevationGainM) * 100 <= 10.0
        ).toBe(true);
      }

      if (ref.splits) {
        expect(parsed.splits).toHaveLength(ref.splits.length);
        for (const refSp of ref.splits) {
          const actualSp = parsed.splits.find(
            (s) => s.kilometer === refSp.kilometer
          );
          expect(actualSp).toBeDefined();
          expect(actualSp!.paceFormatted).toBe(refSp.paceFormatted);
          expect(Math.abs(actualSp!.paceSeconds - refSp.paceSeconds)).toBeLessThanOrEqual(
            3
          );
        }
      }

      const zodRes = CreateTrainingSessionSchema.safeParse({
        source: "gpx_upload",
        externalId: parsed.externalId,
        sessionDate: parsed.startedAt,
        activityType:
          parsed.sourceActivityKind === "walk" ? "caminhada" : "corrida_continua",
        distanceKm: parsed.distanceKm,
        durationSeconds: parsed.durationSeconds,
        elapsedSeconds: parsed.elapsedSeconds,
        speedKmh: parsed.speedKmh,
        paceSeconds: parsed.paceSeconds,
        paceFormatted: parsed.paceFormatted,
        avgHeartRate: parsed.avgHeartRate,
        maxHeartRate: parsed.maxHeartRate,
        elevationGainM: parsed.elevationGainM,
        avgCadence: parsed.avgCadence,
        notes: parsed.name,
        splits: parsed.splits,
      });
      expect(zodRes.success).toBe(true);
    }

    expect(isGpxParseError(new GpxParseError("INVALID_XML", "msg"))).toBe(true);
    expect(isGpxParseError({ name: "GpxParseError", code: "INVALID_XML", message: "msg" })).toBe(true);
    expect(isGpxParseError(new Error("normal"))).toBe(false);
    expect(isGpxParseError(null)).toBe(false);
  });
});
