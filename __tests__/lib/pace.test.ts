import { describe, it, expect } from "vitest";
import {
  calcDistanceFromTimeAndSpeed,
  calcPaceFromDistanceAndTime,
  calcPaceFromSpeed,
  calcSpeedFromPace,
  calcTimeForDistance,
} from "@/lib/math/pace";

describe("calcPaceFromDistanceAndTime", () => {
  it("caso do enunciado: 3 km em 20 min (1200s) -> 9 km/h e pace 6:40", () => {
    const result = calcPaceFromDistanceAndTime(3, 20 * 60);
    expect(result.paceFormatted).toBe("6:40");
    expect(result.paceSeconds).toBe(400);
    expect(result.speedKmh).toBeCloseTo(9.0, 1);
  });

  it("calcula 10 km em 50 minutos (pace 5:00, 12 km/h)", () => {
    const result = calcPaceFromDistanceAndTime(10, 50 * 60);
    expect(result.paceFormatted).toBe("5:00");
    expect(result.speedKmh).toBeCloseTo(12.0, 1);
  });

  it("calcula 5 km em 25min 30s", () => {
    const result = calcPaceFromDistanceAndTime(5, 25 * 60 + 30);
    expect(result.paceFormatted).toBe("5:06");
  });

  it("rejeita distância <= 0", () => {
    expect(() => calcPaceFromDistanceAndTime(0, 1200)).toThrow();
    expect(() => calcPaceFromDistanceAndTime(-3, 1200)).toThrow();
  });

  it("rejeita tempo <= 0", () => {
    expect(() => calcPaceFromDistanceAndTime(3, 0)).toThrow();
    expect(() => calcPaceFromDistanceAndTime(3, -100)).toThrow();
  });
});

describe("calcSpeedFromPace", () => {
  it("caso do enunciado: pace 400 s/km (6:40) -> 9 km/h", () => {
    expect(calcSpeedFromPace(400)).toBeCloseTo(9.0, 2);
  });

  it("pace 300 s/km (5:00) -> 12 km/h", () => {
    expect(calcSpeedFromPace(300)).toBeCloseTo(12.0, 2);
  });

  it("pace 240 s/km (4:00) -> 15 km/h", () => {
    expect(calcSpeedFromPace(240)).toBeCloseTo(15.0, 2);
  });

  it("rejeita pace <= 0", () => {
    expect(() => calcSpeedFromPace(0)).toThrow();
    expect(() => calcSpeedFromPace(-10)).toThrow();
  });
});

describe("calcPaceFromSpeed", () => {
  it("caso do enunciado: velocidade 9 km/h -> 400 s/km (pace 6:40)", () => {
    expect(calcPaceFromSpeed(9)).toBeCloseTo(400, 2);
  });

  it("velocidade 12 km/h -> 300 s/km (5:00)", () => {
    expect(calcPaceFromSpeed(12)).toBeCloseTo(300, 2);
  });

  it("rejeita velocidade <= 0", () => {
    expect(() => calcPaceFromSpeed(0)).toThrow();
    expect(() => calcPaceFromSpeed(-5)).toThrow();
  });
});

describe("calcTimeForDistance", () => {
  it("3 km com pace 400 s/km -> 1200 segundos (20 min)", () => {
    expect(calcTimeForDistance(3, 400)).toBe(1200);
  });

  it("5 km com pace 300 s/km -> 1500 segundos (25 min)", () => {
    expect(calcTimeForDistance(5, 300)).toBe(1500);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => calcTimeForDistance(0, 400)).toThrow();
    expect(() => calcTimeForDistance(3, 0)).toThrow();
  });
});

describe("calcDistanceFromTimeAndSpeed", () => {
  it("20 min (1200s) a 9 km/h -> 3 km", () => {
    expect(calcDistanceFromTimeAndSpeed(1200, 9)).toBeCloseTo(3.0, 2);
  });

  it("60 min (3600s) a 10 km/h -> 10 km", () => {
    expect(calcDistanceFromTimeAndSpeed(3600, 10)).toBeCloseTo(10.0, 2);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => calcDistanceFromTimeAndSpeed(0, 9)).toThrow();
    expect(() => calcDistanceFromTimeAndSpeed(1200, 0)).toThrow();
  });
});
