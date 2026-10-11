import { describe, it, expect } from "vitest";
import { calcIntervalSession } from "@/lib/math/intervals";

describe("calcIntervalSession", () => {
  it("calcula sessão completa com aquecimento, tiros e desaquecimento", () => {
    const session = calcIntervalSession({
      warmupDurationSeconds: 300, // 5 min
      warmupSpeedKmh: 6,
      runDurationSeconds: 120, // 2 min
      runSpeedKmh: 12,
      walkDurationSeconds: 60, // 1 min
      walkSpeedKmh: 6,
      repetitions: 4,
      cooldownDurationSeconds: 300, // 5 min
      cooldownSpeedKmh: 6,
    });

    // 1 warmup + (4 run + 4 walk) + 1 cooldown = 10 etapas
    expect(session.stages.length).toBe(10);

    // Tempo total: 300 + 4*(120+60) + 300 = 1320 segundos (22 min)
    expect(session.totalTimeSeconds).toBe(1320);

    // Distância total: 0.5 + 4*(0.4 + 0.1) + 0.5 = 3.0 km
    expect(session.totalDistanceKm).toBeCloseTo(3.0, 2);

    // Velocidade média = (3 * 3600) / 1320 = 8.18 km/h
    expect(session.averageSpeedKmh).toBeCloseTo(8.18, 1);

    // Pace médio = 1320 / 3 = 440s -> 7:20 min/km
    expect(session.averagePaceFormatted).toBe("7:20");
    expect(session.averagePaceSeconds).toBe(440);

    // Primeiro estágio: warmup
    expect(session.stages[0].type).toBe("warmup");
    expect(session.stages[0].distanceKm).toBeCloseTo(0.5, 2);
    expect(session.stages[0].paceFormatted).toBe("10:00"); // 6 km/h -> 10:00

    // Segundo estágio: run (tiro 1)
    expect(session.stages[1].type).toBe("run");
    expect(session.stages[1].distanceKm).toBeCloseTo(0.4, 2);
    expect(session.stages[1].paceFormatted).toBe("5:00"); // 12 km/h -> 5:00
  });

  it("calcula sessão sem aquecimento e sem desaquecimento", () => {
    const session = calcIntervalSession({
      warmupDurationSeconds: 0,
      warmupSpeedKmh: 0,
      runDurationSeconds: 60, // 1 min
      runSpeedKmh: 15,
      walkDurationSeconds: 60, // 1 min
      walkSpeedKmh: 5,
      repetitions: 3,
      cooldownDurationSeconds: 0,
      cooldownSpeedKmh: 0,
    });

    // 3 run + 3 walk = 6 etapas
    expect(session.stages.length).toBe(6);
    expect(session.totalTimeSeconds).toBe(360); // 6 min
  });

  it("rejeita repetições <= 0 ou parâmetros negativos", () => {
    expect(() =>
      calcIntervalSession({
        warmupDurationSeconds: 0,
        warmupSpeedKmh: 0,
        runDurationSeconds: 60,
        runSpeedKmh: 10,
        walkDurationSeconds: 60,
        walkSpeedKmh: 5,
        repetitions: 0,
        cooldownDurationSeconds: 0,
        cooldownSpeedKmh: 0,
      })
    ).toThrow();
  });
});
