import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, buildSegmentStepPairs } from "@/lib/gpx/geo";
import { GpxSegment, GpxTrackPoint } from "@/lib/gpx/types";

function makePt(
  lat: number,
  lon: number,
  secOffset: number,
  extra?: Partial<GpxTrackPoint>
): GpxTrackPoint {
  const timestampMs = Date.UTC(2026, 10, 13, 9, 0, 0) + secOffset * 1000;
  return {
    lat,
    lon,
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

describe("lib/gpx/geo — Geometria Haversine e construção de pares filtrados (4.2 & 4.3)", () => {
  describe("haversineDistanceMeters (4.2)", () => {
    it("retorna 0 para dois pontos com coordenadas idênticas", () => {
      expect(haversineDistanceMeters(-23.55052, -46.633308, -23.55052, -46.633308)).toBe(0);
    });

    it("calcula 1° de latitude como 111.194,93 m (R = 6.371.000 m)", () => {
      const dist = haversineDistanceMeters(0, 0, 1, 0);
      expect(dist).toBeCloseTo(111194.9266, 2);
    });

    it("é simétrica entre (A, B) e (B, A)", () => {
      const d1 = haversineDistanceMeters(-4.22581, -38.73012, -4.23581, -38.74012);
      const d2 = haversineDistanceMeters(-4.23581, -38.74012, -4.22581, -38.73012);
      expect(d1).toBeCloseTo(d2, 9);
    });
  });

  describe("buildSegmentStepPairs (4.3)", () => {
    // 1 metro em latitude ≈ 1 / 111194.92664455873 graus
    const DEG_PER_METER = 1 / 111194.92664455873;

    it("itera apenas dentro de cada trkseg e nunca soma distância/tempo entre segmentos", () => {
      const seg1: GpxSegment = {
        points: [
          makePt(0, 0, 0),
          makePt(10 * DEG_PER_METER, 0, 3), // +10m em 3s (3.33 m/s)
        ],
      };
      // Salto de 500m e 120s entre o fim do seg1 e o início do seg2
      const seg2: GpxSegment = {
        points: [
          makePt(510 * DEG_PER_METER, 0, 123),
          makePt(520 * DEG_PER_METER, 0, 126), // +10m em 3s
        ],
      };

      const res = buildSegmentStepPairs([seg1, seg2]);
      expect(res.pairs).toHaveLength(2);
      const totalDist = res.pairs.reduce((acc, p) => acc + p.deltaDistanceM, 0);
      const totalMov = res.pairs.reduce((acc, p) => acc + p.movingTimeSeconds, 0);
      expect(totalDist).toBeCloseTo(20, 2);
      expect(totalMov).toBe(6);
    });

    it("descarta pontos com Δt <= 0 (timestamps duplicados ou regressivos) e registra warning", () => {
      const seg: GpxSegment = {
        points: [
          makePt(0, 0, 0),
          makePt(3.333 * DEG_PER_METER, 0, 1),
          makePt(5.0 * DEG_PER_METER, 0, 1), // Δt = 0 (duplicado)
          makePt(4.0 * DEG_PER_METER, 0, 0), // Δt = -1 (regressivo)
          makePt(6.666 * DEG_PER_METER, 0, 2), // retoma em t=2 a partir da âncora t=1
        ],
      };

      const res = buildSegmentStepPairs([seg]);
      expect(res.discardedNonPositiveDeltaCount).toBe(2);
      expect(res.pairs).toHaveLength(2);
      expect(res.warnings.some((w) => w.code === "NON_POSITIVE_DELTA_TIME_SKIPPED")).toBe(true);
      const totalDist = res.pairs.reduce((acc, p) => acc + p.deltaDistanceM, 0);
      expect(totalDist).toBeCloseTo(6.666, 2);
    });

    it("descarta spikes de GPS (v > 12 m/s), emite warning e reconecta do ponto âncora sem inflar distância", () => {
      const seg: GpxSegment = {
        points: [
          makePt(0, 0, 0),
          makePt(3.333 * DEG_PER_METER, 0, 1),
          makePt(500 * DEG_PER_METER, 0, 2), // Spike: ~496m em 1s = 496 m/s > 12 m/s
          makePt(10.0 * DEG_PER_METER, 0, 3), // Ponto real em t=3s (10m desde t=0)
        ],
      };

      const res = buildSegmentStepPairs([seg]);
      expect(res.discardedSpikeCount).toBe(1);
      expect(res.warnings.some((w) => w.code === "GPS_SPIKE_SKIPPED")).toBe(true);
      const totalDist = res.pairs.reduce((acc, p) => acc + p.deltaDistanceM, 0);
      const totalMov = res.pairs.reduce((acc, p) => acc + p.movingTimeSeconds, 0);
      expect(totalDist).toBeCloseTo(10.0, 2);
      expect(totalMov).toBe(3);
    });

    it("marca pares com velocidade abaixo do limiar (0,894 m/s) como parados (movingTimeSeconds = 0)", () => {
      const seg: GpxSegment = {
        points: [
          makePt(0, 0, 0),
          makePt(0.5 * DEG_PER_METER, 0, 1), // 0,5 m/s < 0,894 m/s (parado)
          makePt(4.5 * DEG_PER_METER, 0, 2), // +4,0 m em 1s = 4,0 m/s >= 0,894 m/s (em movimento)
        ],
      };

      const res = buildSegmentStepPairs([seg]);
      expect(res.stationaryPairsCount).toBe(1);
      expect(res.movingPairsCount).toBe(1);
      expect(res.pairs[0].isMoving).toBe(false);
      expect(res.pairs[0].movingTimeSeconds).toBe(0);
      expect(res.pairs[1].isMoving).toBe(true);
      expect(res.pairs[1].movingTimeSeconds).toBe(1);
    });
  });
});
