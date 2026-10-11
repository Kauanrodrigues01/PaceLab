import { describe, it, expect } from "vitest";
import { calcAveragePaces, calcWeightedAveragePaces } from "@/lib/math/averages";

describe("calcAveragePaces", () => {
  // Lista exata do exemplo fornecido no prompt
  const pacesPrompt = [
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

  it("calcula corretamente com a lista do enunciado (9 parciais)", () => {
    const result = calcAveragePaces(pacesPrompt);

    expect(result.count).toBe(9);
    // Pace médio = 3610 / 9 = 401.11s -> formatPace(401) = "6:41"
    expect(result.averagePaceFormatted).toBe("6:41");
    expect(result.averagePaceSeconds).toBeCloseTo(401.11, 1);

    // Mais rápido e mais lento
    expect(result.fastestPaceFormatted).toBe("6:02");
    expect(result.fastestPaceSeconds).toBe(362);

    expect(result.slowestPaceFormatted).toBe("7:34");
    expect(result.slowestPaceSeconds).toBe(454);

    // Diferença: 454 - 362 = 92s -> formatPace(92) = "1:32"
    expect(result.differenceFormatted).toBe("1:32");
    expect(result.differenceSeconds).toBe(92);

    // Velocidade média ~ 8.97 km/h
    expect(result.speedKmh).toBeCloseTo(8.97, 1);

    // Projeções estimadas
    expect(result.estimatedTimes["1.6km"]).toBeDefined();
    expect(result.estimatedTimes["2km"]).toBeDefined();
    expect(result.estimatedTimes["2.3km"]).toBeDefined();
    expect(result.estimatedTimes["3km"]).toBeDefined();
    expect(result.estimatedTimes["5km"]).toBeDefined();
    expect(result.estimatedTimes["10km"]).toBeDefined();
  });

  it("ignora linhas vazias ou com espaços", () => {
    const withBlanks = ["", "  ", "5:00", "", "6:00", "  "];
    const result = calcAveragePaces(withBlanks);
    expect(result.count).toBe(2);
    expect(result.averagePaceFormatted).toBe("5:30");
  });

  it("lança erro se não houver paces válidos", () => {
    expect(() => calcAveragePaces([])).toThrow();
    expect(() => calcAveragePaces(["   ", ""])).toThrow();
  });
});

describe("calcWeightedAveragePaces", () => {
  it("calcula média ponderada quando as distâncias são diferentes", () => {
    // Exemplo: 2 km a 5:00 (600s total) + 1 km a 6:00 (360s total)
    // Tempo total = 960s, Distância total = 3 km -> Pace médio = 960 / 3 = 320s (5:20)
    const entries = [
      { paceStr: "5:00", distanceKm: 2 },
      { paceStr: "6:00", distanceKm: 1 },
    ];

    const result = calcWeightedAveragePaces(entries);
    expect(result.count).toBe(2);
    expect(result.averagePaceSeconds).toBe(320);
    expect(result.averagePaceFormatted).toBe("5:20");
    expect(result.fastestPaceFormatted).toBe("5:00");
    expect(result.slowestPaceFormatted).toBe("6:00");
  });

  it("assume 1km como fallback se distância não informada", () => {
    const entries = [
      { paceStr: "5:00" },
      { paceStr: "6:00" },
    ];
    const result = calcWeightedAveragePaces(entries);
    expect(result.averagePaceFormatted).toBe("5:30");
  });
});
