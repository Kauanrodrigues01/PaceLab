import { describe, it, expect } from "vitest";
import {
  calcPaceFromDistanceAndTime,
  calcSpeedFromPace,
  calcPaceFromSpeed,
} from "@/lib/math/pace";
import { calcTaf } from "@/lib/math/taf";
import { calcAveragePaces } from "@/lib/math/averages";
import { parsePace, formatPace, formatDecimal } from "@/lib/formatting/time";

describe("Fase 10 — QA dos Casos Obrigatórios do Enunciado", () => {
  it("Caso 1: 3 km em 20 min -> Pace 6:40 e Velocidade 9,0 km/h", () => {
    const distKm = 3;
    const timeSeconds = 20 * 60; // 1200s
    const result = calcPaceFromDistanceAndTime(distKm, timeSeconds);

    expect(result.paceFormatted).toBe("6:40");
    expect(result.paceSeconds).toBe(400);
    expect(formatDecimal(result.speedKmh, 1)).toBe("9.0");
  });

  it("Caso 2: Pace 6:40 -> Velocidade 9,0 km/h", () => {
    const paceSeconds = parsePace("6:40"); // 400s
    const speed = calcSpeedFromPace(paceSeconds);

    expect(formatDecimal(speed, 1)).toBe("9.0");
  });

  it("Caso 3: Velocidade 9 km/h -> Pace 6:40", () => {
    const speedKmh = 9.0;
    const paceSeconds = calcPaceFromSpeed(speedKmh);

    expect(formatPace(paceSeconds)).toBe("6:40");
  });

  it("Caso 4: TAF 12 min / 2300 m -> Velocidade 11,5 km/h e Pace 5:13", () => {
    const durationMinutes = 12;
    const targetMeters = 2300;
    const result = calcTaf(durationMinutes, targetMeters, 400);

    expect(formatDecimal(result.speedKmh, 1)).toBe("11.5");
    expect(result.paceFormatted).toBe("5:13");
    // Voltas de 400m para 2300m = 5 voltas de 400m + parcial de 300m (total 6 trechos)
    expect(result.splits.length).toBe(6);
  });

  it("Caso 5: Paces 6:13..7:13 (9 valores) -> Count 9, médias corretas", () => {
    const paces = [
      "6:13",
      "6:33",
      "6:14",
      "6:55",
      "7:34",
      "6:11",
      "7:15",
      "6:02",
      "7:13",
    ];

    const result = calcAveragePaces(paces);

    expect(result.count).toBe(9);
    // Pace médio calculado com precisão
    expect(result.averagePaceSeconds).toBeGreaterThan(390);
    expect(result.averagePaceSeconds).toBeLessThan(410);
    // Mais rápido: 6:02
    expect(result.fastestPaceFormatted).toBe("6:02");
    // Mais lento: 7:34
    expect(result.slowestPaceFormatted).toBe("7:34");
    // Diferença calculada
    expect(result.differenceSeconds).toBe(parsePace("7:34") - parsePace("6:02"));
    expect(result.differenceFormatted).toBe("1:32");
  });
});
