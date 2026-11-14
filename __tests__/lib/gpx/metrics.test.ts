import { describe, it, expect } from "vitest";
import { computeGpxMetrics, formatPaceSeconds } from "@/lib/gpx/metrics";
import { buildSegmentStepPairs } from "@/lib/gpx/geo";
import { GpxParseError, GpxSegment, GpxTrackPoint } from "@/lib/gpx/types";

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
    temperatureC: 25,
    powerW: null,
    ...extra,
  };
}

describe("lib/gpx/metrics — Cálculo de distância, tempos, pace e sensores (4.4 & 4.5)", () => {
  it("formatPaceSeconds formata segundos como m:ss com zero à esquerda", () => {
    expect(formatPaceSeconds(300)).toBe("5:00");
    expect(formatPaceSeconds(275)).toBe("4:35");
    expect(formatPaceSeconds(365)).toBe("6:05");
  });

  it("calcula métricas exatas em corrida contínua (1000m em 300s => 5:00/km, 12 km/h, cad 85 -> 170 spm)", () => {
    const points: GpxTrackPoint[] = [];
    for (let t = 0; t <= 300; t++) {
      points.push(
        makePt((1000 / 300) * t, t, {
          heartRateBpm: t === 150 ? 175 : 150,
          cadenceRaw: 85,
          temperatureC: 24,
        })
      );
    }
    const segments: GpxSegment[] = [{ points }];
    const stepRes = buildSegmentStepPairs(segments);
    const metrics = computeGpxMetrics(segments, stepRes.pairs, "run");

    expect(metrics.distanceKm).toBe(1);
    expect(metrics.durationSeconds).toBe(300);
    expect(metrics.elapsedSeconds).toBe(300);
    expect(metrics.speedKmh).toBe(12);
    expect(metrics.paceSeconds).toBe(300);
    expect(metrics.paceFormatted).toBe("5:00");
    expect(metrics.avgHeartRate).toBe(150);
    expect(metrics.maxHeartRate).toBe(175);
    expect(metrics.avgCadence).toBe(170); // 85 * 2
    expect(metrics.avgTemperatureC).toBe(24);
  });

  it("não dobra cadência quando já está em passos totais por minuto (>= 130 spm)", () => {
    const points = [
      makePt(0, 0, { cadenceRaw: 172 }),
      makePt(100, 30, { cadenceRaw: 172 }),
      makePt(200, 60, { cadenceRaw: 172 }),
    ];
    const segments: GpxSegment[] = [{ points }];
    const stepRes = buildSegmentStepPairs(segments);
    const metrics = computeGpxMetrics(segments, stepRes.pairs, "run");

    expect(metrics.avgCadence).toBe(172);
  });

  it("calcula FC média apenas nos pares em movimento (ignora FC de quando parado)", () => {
    const points = [
      makePt(0, 0, { heartRateBpm: 160 }),
      makePt(100, 30, { heartRateBpm: 160 }), // 30s em movimento a 160 bpm
      makePt(100, 90, { heartRateBpm: 100 }), // 60s parado a 100 bpm (não deve puxar média para baixo)
      makePt(200, 120, { heartRateBpm: 160 }), // 30s em movimento a 160 bpm
    ];
    const segments: GpxSegment[] = [{ points }];
    const stepRes = buildSegmentStepPairs(segments);
    const metrics = computeGpxMetrics(segments, stepRes.pairs, "run");

    expect(metrics.durationSeconds).toBe(60);
    expect(metrics.elapsedSeconds).toBe(120);
    expect(metrics.avgHeartRate).toBe(160);
    expect(metrics.maxHeartRate).toBe(160);
  });

  it("retorna null para sensores ausentes e adiciona warnings informativos", () => {
    const points = [
      makePt(0, 0, { heartRateBpm: null, cadenceRaw: null, temperatureC: null }),
      makePt(100, 30, { heartRateBpm: null, cadenceRaw: null, temperatureC: null }),
    ];
    const segments: GpxSegment[] = [{ points }];
    const stepRes = buildSegmentStepPairs(segments);
    const metrics = computeGpxMetrics(segments, stepRes.pairs, "run");

    expect(metrics.avgHeartRate).toBeNull();
    expect(metrics.maxHeartRate).toBeNull();
    expect(metrics.avgCadence).toBeNull();
    expect(metrics.avgTemperatureC).toBeNull();
    expect(metrics.warnings.some((w) => w.code === "NO_HEART_RATE_DATA")).toBe(true);
    expect(metrics.warnings.some((w) => w.code === "NO_CADENCE_DATA")).toBe(true);
  });

  it("lança ZERO_DISTANCE quando distância total é zero e ZERO_MOVING_TIME quando tempo em movimento é zero", () => {
    const zeroDistSeg: GpxSegment[] = [
      {
        points: [makePt(0, 0), makePt(0, 10)],
      },
    ];
    const zeroDistPairs = buildSegmentStepPairs(zeroDistSeg).pairs;
    try {
      computeGpxMetrics(zeroDistSeg, zeroDistPairs, "run");
      expect.fail("Deveria lançar ZERO_DISTANCE");
    } catch (e) {
      expect((e as GpxParseError).code).toBe("ZERO_DISTANCE");
    }

    // Deslocou 20m em 100s (0,2 m/s < 0,894 m/s -> movingTime = 0)
    const slowSeg: GpxSegment[] = [
      {
        points: [makePt(0, 0), makePt(20, 100)],
      },
    ];
    const slowPairs = buildSegmentStepPairs(slowSeg).pairs;
    try {
      computeGpxMetrics(slowSeg, slowPairs, "run");
      expect.fail("Deveria lançar ZERO_MOVING_TIME");
    } catch (e) {
      expect((e as GpxParseError).code).toBe("ZERO_MOVING_TIME");
    }
  });

  it("rejeita com UNSUPPORTED_ACTIVITY quando velocidade média em movimento está fora de 2..25 km/h (D5)", () => {
    // 10 m/s = 36 km/h (> 25 km/h, provável ciclismo mesmo sem tag <type>)
    const fastSeg: GpxSegment[] = [
      {
        points: [makePt(0, 0), makePt(1000, 100)],
      },
    ];
    const fastPairs = buildSegmentStepPairs(fastSeg).pairs;
    try {
      computeGpxMetrics(fastSeg, fastPairs, "unknown");
      expect.fail("Deveria lançar UNSUPPORTED_ACTIVITY");
    } catch (e) {
      expect((e as GpxParseError).code).toBe("UNSUPPORTED_ACTIVITY");
    }
  });
});
