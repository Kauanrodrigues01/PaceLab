import { describe, it, expect } from "vitest";
import { calcFixedTargetTaf, calcTaf } from "@/lib/math/taf";

describe("calcTaf", () => {
  it("caso do enunciado: 12 minutos para 2300 metros", () => {
    const result = calcTaf(12, 2300, 400);

    // Velocidade = 2.3 km / 0.2 h = 11.5 km/h
    expect(result.speedKmh).toBeCloseTo(11.5, 2);
    // Pace = 720s / 2.3km = 313.04s -> 5:13 min/km
    expect(result.paceFormatted).toBe("5:13");
    expect(result.paceSeconds).toBeCloseTo(313.04, 1);

    // Distância por minuto = 2.3 / 12 = 0.19167 km/min
    expect(result.distancePerMinuteKm).toBeCloseTo(0.1917, 3);

    // Splits: 2300m em voltas de 400m = 5 voltas de 400m + 1 volta final de 300m = 6 voltas
    expect(result.splits.length).toBe(6);

    const firstLap = result.splits[0];
    expect(firstLap.lap).toBe(1);
    expect(firstLap.distanceKm).toBeCloseTo(0.4, 3);
    expect(firstLap.accumulatedDistanceKm).toBeCloseTo(0.4, 3);
    // Tempo da primeira volta = 0.4 * 313.04 = ~125.2s -> "2:05"
    expect(firstLap.lapTimeFormatted).toBe("2:05");

    const lastLap = result.splits[5];
    expect(lastLap.lap).toBe(6);
    expect(lastLap.distanceKm).toBeCloseTo(0.3, 3);
    expect(lastLap.accumulatedDistanceKm).toBeCloseTo(2.3, 3);
    expect(lastLap.accumulatedTimeFormatted).toBe("12:00");
    expect(lastLap.progressPercent).toBe(100);
  });

  it("calcula progresso e distância restante quando fornecida distância atual", () => {
    // Meta: 2300m, atual: 1840m (80% da meta)
    const result = calcTaf(12, 2300, 400, 1840);

    expect(result.progressPercent).toBeCloseTo(80.0, 1);
    expect(result.remainingDistanceKm).toBeCloseTo(0.46, 2); // 460 metros
    expect(result.currentDistanceKm).toBeCloseTo(1.84, 2);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => calcTaf(0, 2300)).toThrow();
    expect(() => calcTaf(12, 0)).toThrow();
    expect(() => calcTaf(12, 2300, 0)).toThrow();
  });
});

describe("calcFixedTargetTaf", () => {
  it("meta com distância fixa e tempo máximo: 2400m em até 12 minutos", () => {
    const result = calcFixedTargetTaf(2400, 12);

    expect(result.speedKmh).toBeCloseTo(12.0, 2);
    expect(result.paceFormatted).toBe("5:00");
    expect(result.maxTimeFormatted).toBe("12:00");
    expect(result.targetDistanceKm).toBeCloseTo(2.4, 2);
  });

  it("rejeita valores negativos ou zero", () => {
    expect(() => calcFixedTargetTaf(0, 12)).toThrow();
    expect(() => calcFixedTargetTaf(2400, 0)).toThrow();
  });
});
