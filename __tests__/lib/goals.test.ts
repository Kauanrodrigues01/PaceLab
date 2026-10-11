import { describe, it, expect } from "vitest";
import { calcGoalFromPace, calcGoalFromTime } from "@/lib/math/goals";

describe("calcGoalFromPace", () => {
  it("calcula corrida de 5 km com pace 5:00 (300 s/km)", () => {
    const result = calcGoalFromPace({
      distanceKm: 5,
      paceSeconds: 300,
      splitDistanceMeters: 1000,
    });

    expect(result.totalTimeSeconds).toBe(1500); // 25 min
    expect(result.totalTimeFormatted).toBe("25:00");
    expect(result.speedKmh).toBeCloseTo(12.0, 1);
    expect(result.paceFormatted).toBe("5:00");

    // 5 parciais de 1 km
    expect(result.splits.length).toBe(5);
    expect(result.splits[0].distanceKm).toBe(1);
    expect(result.splits[0].splitTimeFormatted).toBe("5:00");
    expect(result.splits[4].accumulatedDistanceKm).toBe(5);
    expect(result.splits[4].accumulatedTimeFormatted).toBe("25:00");
  });

  it("calcula parciais a cada 400m para 2.3 km", () => {
    const result = calcGoalFromPace({
      distanceKm: 2.3,
      paceSeconds: 313.04,
      splitDistanceMeters: 400,
    });

    // 5 voltas de 400m + 1 volta de 300m = 6 parciais
    expect(result.splits.length).toBe(6);
    expect(result.splits[5].distanceKm).toBeCloseTo(0.3, 2);
    expect(result.splits[5].accumulatedDistanceKm).toBeCloseTo(2.3, 2);
  });

  it("rejeita entradas <= 0", () => {
    expect(() => calcGoalFromPace({ distanceKm: 0, paceSeconds: 300 })).toThrow();
    expect(() => calcGoalFromPace({ distanceKm: 5, paceSeconds: 0 })).toThrow();
  });
});

describe("calcGoalFromTime", () => {
  it("calcula corrida de 10 km para tempo total de 50 minutos (3000s)", () => {
    const result = calcGoalFromTime({
      distanceKm: 10,
      totalTimeSeconds: 3000,
      splitDistanceMeters: 1000,
    });

    expect(result.paceFormatted).toBe("5:00");
    expect(result.speedKmh).toBeCloseTo(12.0, 1);
    expect(result.splits.length).toBe(10);
  });

  it("rejeita tempo <= 0", () => {
    expect(() => calcGoalFromTime({ distanceKm: 5, totalTimeSeconds: 0 })).toThrow();
  });
});
