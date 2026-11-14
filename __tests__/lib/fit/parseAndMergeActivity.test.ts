import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import {
  activityParserService,
  detectActivityFileKind,
  parseAndMergeActivity,
} from "@/lib/activityParser";
import { computeFitExternalId, FitParseError } from "@/lib/fit";

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

const SAMPLE_GPX_SAME_WORKOUT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>2026-11-12T06:00:05Z</time>
  </metadata>
  <trk>
    <name>Treino Forte de Ritmo no Parque</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="-23.587416" lon="-46.657634">
        <ele>750.0</ele>
        <time>2026-11-12T06:00:05Z</time>
      </trkpt>
      <trkpt lat="-23.586516" lon="-46.657634">
        <ele>755.0</ele>
        <time>2026-11-12T06:00:35Z</time>
      </trkpt>
      <trkpt lat="-23.585616" lon="-46.657634">
        <ele>762.0</ele>
        <time>2026-11-12T06:01:05Z</time>
      </trkpt>
      <trkpt lat="-23.584716" lon="-46.657634">
        <ele>770.0</ele>
        <time>2026-11-12T06:01:35Z</time>
      </trkpt>
      <trkpt lat="-23.583816" lon="-46.657634">
        <ele>778.0</ele>
        <time>2026-11-12T06:02:05Z</time>
      </trkpt>
      <trkpt lat="-23.582916" lon="-46.657634">
        <ele>786.0</ele>
        <time>2026-11-12T06:02:35Z</time>
      </trkpt>
      <trkpt lat="-23.582016" lon="-46.657634">
        <ele>795.0</ele>
        <time>2026-11-12T06:03:05Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("lib/activityParser/parseAndMergeActivity — Regra de Prioridade e Mesclagem (.FIT > .GPX)", () => {
  it("Modo 1 (Apenas .FIT): retorna source='fit_upload', filesUsed=['fit'] e 100% dos dados do .FIT", () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1530,
        totalDistance: 5000,
        sport: "running",
        avgHeartRate: 164,
        maxHeartRate: 181,
        avgCadence: 87,
        totalAscent: 34,
        totalCalories: 360,
      },
    });

    const result = parseAndMergeActivity({ fitBuffer: fitBuf });

    expect(result.source).toBe("fit_upload");
    expect(result.filesUsed).toEqual(["fit"]);
    expect(result.name).toBeNull();
    expect(result.distanceKm).toBe(5);
    expect(result.durationSeconds).toBe(1500);
    expect(result.elapsedSeconds).toBe(1530);
    expect(result.paceFormatted).toBe("5:00");
    expect(result.avgHeartRate).toBe(164);
    expect(result.maxHeartRate).toBe(181);
    expect(result.avgCadence).toBe(174);
    expect(result.elevationGainM).toBe(34);
    expect(result.activeCalories).toBe(360);
    expect(result.externalId).toBe(
      computeFitExternalId("2026-11-12T06:00:00.000Z", 5)
    );
  });

  it("Modo 2 (Apenas .GPX): retorna source='gpx_upload', filesUsed=['gpx'], título <trk><name> e externalId gpx_*", () => {
    const result = parseAndMergeActivity({ gpxXml: SAMPLE_GPX_SAME_WORKOUT });

    expect(result.source).toBe("gpx_upload");
    expect(result.filesUsed).toEqual(["gpx"]);
    expect(result.name).toBe("Treino Forte de Ritmo no Parque");
    expect(result.externalId).toMatch(/^gpx_[a-f0-9]{64}$/);
    expect(result.elevationGainM).toBeGreaterThan(0);
    expect(result.activeCalories).toBeNull();
  });

  it("Modo 3 (.FIT + .GPX do mesmo treino): mantém 100% da telemetria do .FIT e complementa Nome (<trk><name>) e Elevação (quando totalAscent=0 no .FIT)", () => {
    // No .FIT: distância = 5.000 m, duração = 1.500 s, totalAscent = 0 (sem barômetro) e sem título
    // No .GPX: distância ~1.000 m, duração = 300 s, <trk><name>="Treino Forte de Ritmo no Parque", elevação ~25 m
    const fitBuf = buildFitBuffer({
      laps: [
        {
          startTime: new Date("2026-11-12T06:00:00Z"),
          totalTimerTime: 750,
          totalElapsedTime: 750,
          totalDistance: 2500,
          avgHeartRate: 160,
        },
        {
          startTime: new Date("2026-11-12T06:12:30Z"),
          totalTimerTime: 750,
          totalElapsedTime: 750,
          totalDistance: 2500,
          avgHeartRate: 168,
        },
      ],
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1515,
        totalDistance: 5000,
        sport: "running",
        avgHeartRate: 164,
        maxHeartRate: 182,
        avgCadence: 88, // 176 spm
        totalAscent: 0, // zero no .FIT -> deve puxar do .GPX!
        totalCalories: 385,
      },
    });

    const result = parseAndMergeActivity({
      fitBuffer: fitBuf,
      gpxXml: SAMPLE_GPX_SAME_WORKOUT,
    });

    expect(result.source).toBe("fit_upload");
    expect(result.filesUsed).toEqual(["fit", "gpx"]);

    // Prioridade absoluta do .FIT para métricas de desempenho e sensores:
    expect(result.distanceKm).toBe(5);
    expect(result.durationSeconds).toBe(1500);
    expect(result.elapsedSeconds).toBe(1515);
    expect(result.paceSeconds).toBe(300);
    expect(result.paceFormatted).toBe("5:00");
    expect(result.avgHeartRate).toBe(164);
    expect(result.maxHeartRate).toBe(182);
    expect(result.avgCadence).toBe(176);
    expect(result.activeCalories).toBe(385);
    expect(result.splits).toHaveLength(2);
    expect(result.externalId).toBe(
      computeFitExternalId("2026-11-12T06:00:00.000Z", 5)
    );

    // Complemento do .GPX:
    expect(result.name).toBe("Treino Forte de Ritmo no Parque");
    expect(result.elevationGainM).toBeGreaterThan(20);
    expect(
      result.warnings.some((w) => w.code === "NAME_MERGED_FROM_GPX")
    ).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "ELEVATION_MERGED_FROM_GPX")
    ).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "MISMATCHED_ACTIVITY_FILES")
    ).toBe(false);
  });

  it("Modo 3 (.FIT + .GPX com totalAscent > 0 no .FIT): preserva o totalAscent barométrico do .FIT e usa apenas o <trk><name> do .GPX", () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
        totalAscent: 48, // Altímetro barométrico presente no .FIT
      },
    });

    const result = parseAndMergeActivity({
      fitBuffer: fitBuf,
      gpxXml: SAMPLE_GPX_SAME_WORKOUT,
    });

    expect(result.name).toBe("Treino Forte de Ritmo no Parque");
    expect(result.elevationGainM).toBe(48); // Mantém o do .FIT!
    expect(
      result.warnings.some((w) => w.code === "ELEVATION_MERGED_FROM_GPX")
    ).toBe(false);
  });

  it("Modo 3 (Validação de Coerência > 5 min): emite warning MISMATCHED_ACTIVITY_FILES quando .FIT e .GPX têm diferença > 5 minutos", () => {
    // .FIT às 08:00:00Z vs .GPX às 06:00:05Z (120 min de diferença)
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T08:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
        totalAscent: 15,
      },
    });

    const result = parseAndMergeActivity({
      fitBuffer: fitBuf,
      gpxXml: SAMPLE_GPX_SAME_WORKOUT,
    });

    const mismatchWarning = result.warnings.find(
      (w) => w.code === "MISMATCHED_ACTIVITY_FILES"
    );
    expect(mismatchWarning).toBeDefined();
    expect(mismatchWarning?.message).toContain("parecem ser de treinos diferentes");
  });

  it("Detecção automática por array de arquivos (files): aceita .GPX e .FIT em qualquer ordem", () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
        totalAscent: 12,
      },
    });

    expect(
      detectActivityFileKind({ fileName: "treino.fit", buffer: fitBuf })
    ).toBe("fit");
    expect(
      detectActivityFileKind({
        fileName: "treino.gpx",
        buffer: SAMPLE_GPX_SAME_WORKOUT,
      })
    ).toBe("gpx");

    // Passando primeiro o .GPX e depois o .FIT
    const merged = activityParserService.parseAndMergeActivity({
      files: [
        { fileName: "complemento.gpx", buffer: SAMPLE_GPX_SAME_WORKOUT },
        { fileName: "original.fit", buffer: fitBuf },
      ],
    });

    expect(merged.source).toBe("fit_upload");
    expect(merged.filesUsed).toEqual(["fit", "gpx"]);
    expect(merged.distanceKm).toBe(5);
    expect(merged.name).toBe("Treino Forte de Ritmo no Parque");
  });

  it("Integração com arquivo real do Strava (Voltando.gpx): mescla .FIT prioritário + Voltando.gpx extraindo <trk><name>='Voltando' e elevação=+3m", () => {
    const voltandoPath = path.resolve(
      process.cwd(),
      "__tests__/fixtures/gpx/strava-real/Voltando.gpx"
    );
    const voltandoXml = fs.readFileSync(voltandoPath, "utf8");

    const fitBuf = buildFitBuffer({
      laps: [
        {
          startTime: new Date("2026-11-13T20:59:40Z"),
          totalTimerTime: 804, // 13:24 no Km 1
          totalElapsedTime: 840,
          totalDistance: 1000,
          avgHeartRate: 132,
        },
        {
          startTime: new Date("2026-11-13T21:13:04Z"),
          totalTimerTime: 384, // 6:24 nos 870 m finais -> pace 7:21
          totalElapsedTime: 390,
          totalDistance: 870,
          avgHeartRate: 148,
        },
      ],
      session: {
        startTime: new Date("2026-11-13T20:59:40Z"),
        totalTimerTime: 1188, // 19:48 exato do Strava
        totalElapsedTime: 1245,
        totalDistance: 1870, // 1,87 km exato do Strava
        sport: "walking",
        avgHeartRate: 139,
        maxHeartRate: 162,
        avgCadence: 82, // 164 spm
        totalAscent: 0, // sem barômetro -> puxa +3 m do Voltando.gpx
        totalCalories: 142,
      },
    });

    const merged = parseAndMergeActivity({
      fitBuffer: fitBuf,
      gpxXml: voltandoXml,
    });

    expect(merged.source).toBe("fit_upload");
    expect(merged.filesUsed).toEqual(["fit", "gpx"]);
    expect(merged.name).toBe("Voltando");
    expect(merged.distanceKm).toBe(1.87);
    expect(merged.durationSeconds).toBe(1188);
    expect(merged.paceFormatted).toBe("10:35");
    expect(merged.elevationGainM).toBe(3); // Extraído do Voltando.gpx
    expect(merged.avgHeartRate).toBe(139);
    expect(merged.avgCadence).toBe(164);
    expect(merged.activeCalories).toBe(142);
    expect(
      merged.warnings.some((w) => w.code === "MISMATCHED_ACTIVITY_FILES")
    ).toBe(false);
  });

  it("Rejeita envio de 2 arquivos do mesmo formato (2 .FIT ou 2 .GPX) ou mais de 2 arquivos", () => {
    const fitBuf = buildFitBuffer({
      session: {
        startTime: new Date("2026-11-12T06:00:00Z"),
        totalTimerTime: 1500,
        totalElapsedTime: 1500,
        totalDistance: 5000,
        sport: "running",
      },
    });

    expect(() =>
      parseAndMergeActivity({
        files: [
          { fileName: "a.fit", buffer: fitBuf },
          { fileName: "b.fit", buffer: fitBuf },
        ],
      })
    ).toThrowError(FitParseError);

    expect(() =>
      parseAndMergeActivity({
        files: [
          { fileName: "a.gpx", buffer: SAMPLE_GPX_SAME_WORKOUT },
          { fileName: "b.gpx", buffer: SAMPLE_GPX_SAME_WORKOUT },
        ],
      })
    ).toThrowError(FitParseError);
  });
});
