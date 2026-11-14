import { describe, it, expect } from "vitest";
import { splitByDistance } from "@/lib/gpx/splits";
import { buildSegmentStepPairs } from "@/lib/gpx/geo";
import { GpxSegment, GpxTrackPoint } from "@/lib/gpx/types";

const DEG_PER_METER = 1 / 111194.92664455873;

function makePt(
  metersFromOrigin: number,
  secOffset: number,
  extra?: Partial<GpxTrackPoint>
): GpxTrackPoint {
  const timestampMs = Date.UTC(2026, 10, 13, 9, 0, 0) + secOffset * 1000;
  return {
    lat: metersFromOrigin * DEG_PER_METER,
    lon: 0,
    timestampMs,
    timestampIso: new Date(timestampMs).toISOString(),
    elevationM: 100,
    heartRateBpm: 150,
    cadenceRaw: 85,
    temperatureC: 24,
    powerW: null,
    ...extra,
  };
}

describe("lib/gpx/splits — splitByDistance com interpolação linear e residual (4.7)", () => {
  it("gera 5 splits exatos de 1,000 km e 300s (5:00/km) para 5.000m sem criar residual espúrio (< 10m)", () => {
    const points: GpxTrackPoint[] = [];
    for (let t = 0; t <= 1500; t += 10) {
      points.push(
        makePt((5000 / 1500) * t, t, {
          heartRateBpm: 150 + Math.floor(t / 300) * 5,
          elevationM: 100 + (t / 300) * 2,
        })
      );
    }

    const segs: GpxSegment[] = [{ points }];
    const { pairs } = buildSegmentStepPairs(segs);
    const splits = splitByDistance(pairs, 1000);

    expect(splits).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(splits[i].kilometer).toBe(i + 1);
      expect(splits[i].distanceKm).toBe(1);
      expect(splits[i].durationSeconds).toBe(300);
      expect(splits[i].paceSeconds).toBe(300);
      expect(splits[i].paceFormatted).toBe("5:00");
      expect(splits[i].elevationDiffM).toBe(2);
    }

    const sumDuration = splits.reduce((acc, s) => acc + s.durationSeconds, 0);
    const sumDistKm = splits.reduce((acc, s) => acc + s.distanceKm, 0);
    expect(Math.abs(sumDuration - 1500)).toBeLessThanOrEqual(1);
    expect(Math.abs(sumDistKm - 5.0)).toBeLessThanOrEqual(0.01);
  });

  it("gera parcial residual proporcional para 5.420m (5 splits de 1 km + 6º split de 0,42 km / 126s / 5:00)", () => {
    const points: GpxTrackPoint[] = [];
    for (let t = 0; t <= 1626; t += 6) {
      points.push(makePt((5420 / 1626) * t, t));
    }

    const segs: GpxSegment[] = [{ points }];
    const { pairs } = buildSegmentStepPairs(segs);
    const splits = splitByDistance(pairs, 1000);

    expect(splits).toHaveLength(6);
    expect(splits[5].kilometer).toBe(6);
    expect(splits[5].distanceKm).toBeCloseTo(0.42, 2);
    expect(splits[5].durationSeconds).toBe(126);
    expect(splits[5].paceSeconds).toBe(300);
    expect(splits[5].paceFormatted).toBe("5:00");

    const sumDuration = splits.reduce((acc, s) => acc + s.durationSeconds, 0);
    const sumDistKm = splits.reduce((acc, s) => acc + s.distanceKm, 0);
    expect(Math.abs(sumDuration - 1626)).toBeLessThanOrEqual(1);
    expect(Math.abs(sumDistKm - 5.42)).toBeLessThanOrEqual(0.01);
  });

  it("interpola linearmente ao cruzar a marca de 1.000m dentro de um passo grande", () => {
    // Passo 1: 0 -> 800m em 240s (5:00/km)
    // Passo 2: 800m -> 1200m (+400m) em 120s (5:00/km) -> cruza 1000m exatamente na metade (f = 0.5 => +60s para fechar km 1 e +60s para abrir km 2)
    // Passo 3: 1200m -> 2000m (+800m) em 240s (5:00/km)
    const points = [
      makePt(0, 0, { elevationM: 100 }),
      makePt(800, 240, { elevationM: 108 }),
      makePt(1200, 360, { elevationM: 112 }),
      makePt(2000, 600, { elevationM: 120 }),
    ];

    const { pairs } = buildSegmentStepPairs([{ points }]);
    const splits = splitByDistance(pairs, 1000);

    expect(splits).toHaveLength(2);
    expect(splits[0].durationSeconds).toBe(300);
    expect(splits[0].elevationDiffM).toBe(10); // 110 - 100
    expect(splits[1].durationSeconds).toBe(300);
    expect(splits[1].elevationDiffM).toBe(10); // 120 - 110
  });

  it("suporta splitDistanceMeters customizado (ex.: 400m para voltas de pista no TAF)", () => {
    const points = [
      makePt(0, 0),
      makePt(400, 96),
      makePt(800, 192),
      makePt(1000, 240), // residual de 200m
    ];
    const { pairs } = buildSegmentStepPairs([{ points }]);
    const laps400 = splitByDistance(pairs, 400);

    expect(laps400).toHaveLength(3);
    expect(laps400[0].distanceKm).toBe(0.4);
    expect(laps400[0].durationSeconds).toBe(96);
    expect(laps400[1].distanceKm).toBe(0.4);
    expect(laps400[1].durationSeconds).toBe(96);
    expect(laps400[2].distanceKm).toBeCloseTo(0.2, 2);
    expect(laps400[2].durationSeconds).toBe(48);
    expect(splitByDistance([], 1000)).toEqual([]);
  });
});
