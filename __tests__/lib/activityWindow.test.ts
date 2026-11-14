import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TAF_WINDOW_SECONDS,
  extractBestTafWindow,
  samplesFromFitRecords,
  samplesFromGpxStepPairs,
} from "@/lib/activityParser/window";
import { parseGpx } from "@/lib/gpx";
import type { FitRecordPoint } from "@/lib/fit/types";
import type { GpxStepPair, GpxTrackPoint } from "@/lib/gpx/types";
import { LapDetailSchema, CreateTafAttemptSchema } from "@/lib/validations/taf";

function buildFitRecordsSegment(params: {
  startTsMs: number;
  startDistM: number;
  durationSec: number;
  stepSec?: number;
  speedMs: number;
  heartRateBpm: number | null;
}): FitRecordPoint[] {
  const stepSec = params.stepSec ?? 5;
  const records: FitRecordPoint[] = [];
  for (let t = 0; t <= params.durationSec; t += stepSec) {
    records.push({
      timestampMs: params.startTsMs + t * 1000,
      timestampIso: new Date(params.startTsMs + t * 1000).toISOString(),
      distanceM: Number((params.startDistM + t * params.speedMs).toFixed(2)),
      lat: null,
      lon: null,
      elevationM: 10,
      heartRateBpm: params.heartRateBpm,
      cadenceRaw: 88,
      temperatureC: 24,
    });
  }
  return records;
}

function makeGpxPoint(params: {
  tsMs: number;
  lat: number;
  lon: number;
  hr: number | null;
}): GpxTrackPoint {
  return {
    lat: params.lat,
    lon: params.lon,
    timestampMs: params.tsMs,
    timestampIso: new Date(params.tsMs).toISOString(),
    elevationM: 10,
    heartRateBpm: params.hr,
    cadenceRaw: null,
    temperatureC: null,
    powerW: null,
  };
}

describe("Fase 9 — Extrator de Janela Contínua de 12 Minutos (Simulado TAF / Cooper)", () => {
  it("extrai exatamente 720s e voltas de 400m válidas pelo LapDetailSchema em treino exato de 12 min (.FIT)", () => {
    const startTs = Date.UTC(2026, 10, 14, 6, 0, 0);
    // 2520 m em 720s = 3.5 m/s = 12.60 km/h (pace 4:46/km)
    const records = buildFitRecordsSegment({
      startTsMs: startTs,
      startDistM: 0,
      durationSec: 720,
      stepSec: 5,
      speedMs: 3.5,
      heartRateBpm: 174,
    });

    const samples = samplesFromFitRecords(records);
    const win = extractBestTafWindow(samples);

    expect(win).not.toBeNull();
    expect(win!.targetDurationSeconds).toBe(DEFAULT_TAF_WINDOW_SECONDS);
    expect(win!.actualDurationSeconds).toBe(720);
    expect(win!.distanceMeters).toBe(2520);
    expect(win!.speedKmh).toBe(12.6);
    expect(win!.isShorterThanTarget).toBe(false);
    expect(win!.avgHeartRate).toBe(174);
    expect(win!.maxHeartRate).toBe(174);

    // 2520m -> 6 voltas completas de 400m + 1 volta residual de 120m = 7 voltas
    expect(win!.laps).toHaveLength(7);
    expect(win!.laps[0].distanceMeters).toBe(400);
    expect(win!.laps[6].distanceMeters).toBe(120);
    for (const lap of win!.laps) {
      expect(LapDetailSchema.safeParse(lap).success).toBe(true);
    }
  });

  it("identifica a melhor janela de 12 min dentro de um treino longo com aquecimento e desaquecimento, isolando a FC da janela", () => {
    const t0 = Date.UTC(2026, 10, 14, 6, 0, 0);

    // 0..300s: aquecimento leve 2.5 m/s (750m), FC 132
    const warmup = buildFitRecordsSegment({
      startTsMs: t0,
      startDistM: 0,
      durationSec: 295,
      stepSec: 5,
      speedMs: 2.5,
      heartRateBpm: 132,
    });

    // 300..1020s (720s): bloco forte Cooper a 4.0 m/s (2880m, acumulado 750 -> 3630m), FC 180 (pico 192 no final)
    const cooperBlock: FitRecordPoint[] = [];
    for (let t = 300; t <= 1020; t += 5) {
      const dist = 750 + (t - 300) * 4.0;
      const hr = t === 1015 ? 192 : 180;
      cooperBlock.push({
        timestampMs: t0 + t * 1000,
        timestampIso: new Date(t0 + t * 1000).toISOString(),
        distanceM: dist,
        lat: null,
        lon: null,
        elevationM: 12,
        heartRateBpm: hr,
        cadenceRaw: 92,
        temperatureC: 23,
      });
    }

    // 1025..1500s: desaquecimento 2.0 m/s, FC 140
    const cooldown = buildFitRecordsSegment({
      startTsMs: t0 + 1025 * 1000,
      startDistM: 3630 + 10,
      durationSec: 475,
      stepSec: 5,
      speedMs: 2.0,
      heartRateBpm: 140,
    });

    const samples = samplesFromFitRecords([...warmup, ...cooperBlock, ...cooldown]);
    const win = extractBestTafWindow(samples);

    expect(win).not.toBeNull();
    expect(win!.actualDurationSeconds).toBe(720);
    expect(win!.distanceMeters).toBe(2880);
    expect(win!.windowStartOffsetSeconds).toBe(300);
    expect(win!.windowEndOffsetSeconds).toBe(1020);
    expect(win!.isShorterThanTarget).toBe(false);
    expect(win!.maxHeartRate).toBe(192);
    // FC média deve refletir o bloco forte (~180), nunca puxada para baixo pelo aquecimento (132)
    expect(win!.avgHeartRate).toBeGreaterThanOrEqual(179);
    expect(win!.avgHeartRate).toBeLessThanOrEqual(182);
    // 2880m -> 7 voltas de 400m + 80m
    expect(win!.laps).toHaveLength(8);
    expect(win!.laps[7].distanceMeters).toBe(80);
  });

  it("sinaliza isShorterThanTarget=true quando a atividade é mais curta que 12 minutos", () => {
    const startTs = Date.UTC(2026, 10, 14, 6, 0, 0);
    // 10 minutos (600s) a 3.5 m/s = 2100m
    const records = buildFitRecordsSegment({
      startTsMs: startTs,
      startDistM: 0,
      durationSec: 600,
      stepSec: 10,
      speedMs: 3.5,
      heartRateBpm: 168,
    });

    const win = extractBestTafWindow(samplesFromFitRecords(records));

    expect(win).not.toBeNull();
    expect(win!.actualDurationSeconds).toBe(600);
    expect(win!.distanceMeters).toBe(2100);
    expect(win!.isShorterThanTarget).toBe(true);
    expect(win!.laps).toHaveLength(6); // 5x 400m + 100m
  });

  it("extrai janela de pares .GPX preservando tempo contínuo real em pausas entre segmentos (sem 'congelar' relógio no Cooper)", () => {
    const t0 = Date.UTC(2026, 10, 14, 7, 0, 0);
    const pairs: GpxStepPair[] = [];

    // Segmento 0: 0..360s, 36 passos de 10s a 40m por passo (1440m)
    for (let i = 0; i < 36; i++) {
      const fromTs = t0 + i * 10_000;
      const toTs = t0 + (i + 1) * 10_000;
      pairs.push({
        segmentIndex: 0,
        from: makeGpxPoint({ tsMs: fromTs, lat: -3.7, lon: -38.5, hr: 170 }),
        to: makeGpxPoint({ tsMs: toTs, lat: -3.7003, lon: -38.5, hr: 170 }),
        deltaDistanceM: 40,
        deltaTimeSeconds: 10,
        speedMs: 4.0,
        isMoving: true,
        movingTimeSeconds: 10,
      });
    }

    // Pausa de 120s entre segmento 0 (t=360s) e segmento 1 (t=480s) sem ganho de distância
    // Segmento 1: 480..840s (360s), 36 passos de 10s a 40m por passo (1440m)
    for (let i = 0; i < 36; i++) {
      const fromTs = t0 + (480 + i * 10) * 1000;
      const toTs = t0 + (480 + (i + 1) * 10) * 1000;
      pairs.push({
        segmentIndex: 1,
        from: makeGpxPoint({ tsMs: fromTs, lat: -3.7003, lon: -38.5, hr: 176 }),
        to: makeGpxPoint({ tsMs: toTs, lat: -3.7006, lon: -38.5, hr: 176 }),
        deltaDistanceM: 40,
        deltaTimeSeconds: 10,
        speedMs: 4.0,
        isMoving: true,
        movingTimeSeconds: 10,
      });
    }

    const samples = samplesFromGpxStepPairs(pairs);
    const win = extractBestTafWindow(samples);

    expect(win).not.toBeNull();
    // Com pausa real de 120s incluída na janela contínua de 720s:
    // melhor janela [0..720] ou [120..840] contém 360s + 240s em movimento = 600s * 4 m/s = 2400m
    expect(win!.distanceMeters).toBe(2400);
    expect(win!.actualDurationSeconds).toBe(720);
  });

  it("usa Haversine quando .FIT tem coordenadas GPS sem campo distanceM", () => {
    const t0 = Date.UTC(2026, 10, 14, 7, 30, 0);
    // Avança ~0.001 graus de latitude a cada 30s (~111.2m / 30s) durante 720s (~2669m)
    const records: FitRecordPoint[] = [];
    for (let step = 0; step <= 24; step++) {
      const t = step * 30;
      records.push({
        timestampMs: t0 + t * 1000,
        timestampIso: new Date(t0 + t * 1000).toISOString(),
        distanceM: null,
        lat: -3.73 + step * 0.001,
        lon: -38.52,
        elevationM: null,
        heartRateBpm: null,
        cadenceRaw: null,
        temperatureC: null,
      });
    }

    const win = extractBestTafWindow(samplesFromFitRecords(records));
    expect(win).not.toBeNull();
    expect(win!.actualDurationSeconds).toBe(720);
    expect(win!.distanceMeters).toBeGreaterThan(2600);
    expect(win!.distanceMeters).toBeLessThan(2750);
  });

  it("recorre ao resumo proporcional quando não há records granulares e retorna null sem dados válidos", () => {
    const fbWin = extractBestTafWindow([], {
      fallbackSummary: {
        durationSeconds: 1440,
        distanceMeters: 4800,
        avgHeartRate: 165,
        maxHeartRate: 180,
      },
    });

    expect(fbWin).not.toBeNull();
    expect(fbWin!.actualDurationSeconds).toBe(720);
    expect(fbWin!.distanceMeters).toBe(2400);
    expect(fbWin!.laps).toHaveLength(6);

    expect(extractBestTafWindow([])).toBeNull();
  });

  it("não corrompe lastCoord em samplesFromFitRecords quando há salto GPS anômalo (> 12 m/s) no fallback Haversine", () => {
    const baseMs = Date.parse("2026-11-10T16:00:00Z");
    const stepLat = 0.00003; // ~3.33 m/s para norte
    const points = [0, 1, 2, 3, 4].map((sec) => ({
      timestampMs: baseMs + sec * 1000,
      timestampIso: new Date(baseMs + sec * 1000).toISOString(),
      distanceM: null,
      // No segundo 2 injeta um salto absurdo de ~1,1 km; nos segundos 3 e 4 retorna à rota normal
      lat: sec === 2 ? -23.5405 : -23.5505 + sec * stepLat,
      lon: -46.6333,
      elevationM: null,
      heartRateBpm: null,
      cadenceRaw: null,
      temperatureC: null,
    }));

    const samples = samplesFromFitRecords(points);
    expect(samples).toHaveLength(5);
    // Salto em sec=2 deve ser ignorado (distância mantida igual a sec=1)
    expect(samples[2].distanceM).toBeCloseTo(samples[1].distanceM, 5);
    // Em sec=3, o cálculo retoma a partir de sec=1 (não da coordenada corrompida em sec=2), recuperando ~10m e ~13.3m em sec=4
    expect(samples[3].distanceM).toBeGreaterThan(9);
    expect(samples[4].distanceM).toBeGreaterThan(12);
    expect(samples[4].distanceM).toBeLessThan(15);
  });

  it("processa arquivos reais do Strava (.GPX) gerando tafWindow e voltas de 400m compatíveis com CreateTafAttemptSchema", () => {
    const fixturesDir = path.resolve(
      process.cwd(),
      "__tests__/fixtures/gpx/strava-real"
    );

    for (const filename of ["Voltando.gpx", "Caminhada_leve.gpx"]) {
      const xml = fs.readFileSync(path.join(fixturesDir, filename), "utf8");
      const parsed = parseGpx(xml);

      expect(parsed.tafWindow).not.toBeNull();
      const win = parsed.tafWindow!;
      expect(win.actualDurationSeconds).toBe(720);
      expect(win.isShorterThanTarget).toBe(false);
      expect(win.distanceMeters).toBeGreaterThanOrEqual(500);
      expect(win.distanceMeters).toBeLessThan(Math.round(parsed.distanceKm * 1000));
      expect(win.laps.length).toBeGreaterThanOrEqual(2);

      for (const lap of win.laps) {
        expect(LapDetailSchema.safeParse(lap).success).toBe(true);
      }

      const payloadCheck = CreateTafAttemptSchema.safeParse({
        source: "gpx_upload",
        externalId: parsed.externalId,
        testDate: parsed.startedAt,
        targetDurationSeconds: win.targetDurationSeconds,
        actualDurationSeconds: win.actualDurationSeconds,
        distanceMeters: win.distanceMeters,
        speedKmh: win.speedKmh,
        paceSeconds: win.paceSeconds,
        paceFormatted: win.paceFormatted,
        locationType: "rua_plana",
        avgHeartRate: win.avgHeartRate,
        maxHeartRate: win.maxHeartRate,
        laps: win.laps,
      });
      expect(payloadCheck.success).toBe(true);
    }
  });
});
