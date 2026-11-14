import { describe, it, expect } from "vitest";
import {
  smoothElevations,
  calculateElevationGain,
  computeSplitElevationDiff,
} from "@/lib/gpx/elevation";

describe("lib/gpx/elevation — Suavização (média móvel de 5 pts) e histerese de 1,0 m (4.6)", () => {
  it("smoothElevations aplica média móvel centrada de 5 pontos", () => {
    const raw = [100, 100, 105, 100, 100];
    const smoothed = smoothElevations(raw, 5);
    expect(smoothed[2]).toBeCloseTo(101, 5);
  });

  it("retorna null quando nenhum ponto possui <ele> válido e 0 quando há apenas 1 ponto", () => {
    expect(calculateElevationGain([])).toBeNull();
    expect(calculateElevationGain([null, null, null])).toBeNull();
    expect(calculateElevationGain([100])).toBe(0);
    expect(smoothElevations([100])).toEqual([100]);
  });

  it("retorna 0 m em terreno plano com ruído de GPS de ±0,4 m (abaixo da histerese de 1,0 m)", () => {
    const noisyFlat: number[] = [];
    for (let i = 0; i < 200; i++) {
      const noise = i % 2 === 0 ? 0.4 : -0.4;
      noisyFlat.push(100 + noise);
    }
    expect(calculateElevationGain(noisyFlat)).toBe(0);
  });

  it("acumula ~10 m (±1 m) em subida constante de +10 m", () => {
    const climb: number[] = [];
    for (let i = 0; i <= 500; i++) {
      climb.push(100 + (10 * i) / 500);
    }
    const gain = calculateElevationGain(climb);
    expect(gain).not.toBeNull();
    expect(gain!).toBeGreaterThanOrEqual(9);
    expect(gain!).toBeLessThanOrEqual(11);
  });

  it("rebaixa a referência ao descer e contabiliza nova subida subsequente", () => {
    // Sobe de 100 para 106 (+6m), desce para 101 (-5m), sobe de 101 para 105 (+4m) => total ~10m
    const profile: number[] = [];
    for (let i = 0; i <= 60; i++) profile.push(100 + (6 * i) / 60);
    for (let i = 1; i <= 50; i++) profile.push(106 - (5 * i) / 50);
    for (let i = 1; i <= 40; i++) profile.push(101 + (4 * i) / 40);

    const gain = calculateElevationGain(profile);
    expect(gain).not.toBeNull();
    expect(gain!).toBeGreaterThanOrEqual(9);
    expect(gain!).toBeLessThanOrEqual(11);
  });

  it("não contabiliza em dobro pequenas oscilações (< 1,0 m) durante uma subida contínua", () => {
    // Subida de 100m a 110m com pequenas oscilações de -0,3m no meio da rampa
    const profile: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const base = 100 + (10 * i) / 200;
      const dip = i % 10 === 5 ? -0.3 : 0;
      profile.push(base + dip);
    }

    const gain = calculateElevationGain(profile, { windowSize: 1 });
    expect(gain).not.toBeNull();
    expect(gain!).toBeCloseTo(10, 1);
  });

  it("computeSplitElevationDiff calcula Math.round(eleFim - eleInicio) e evita -0", () => {
    expect(computeSplitElevationDiff(100.2, 108.6)).toBe(8);
    expect(computeSplitElevationDiff(108.6, 100.2)).toBe(-8);
    expect(computeSplitElevationDiff(100.2, 100.0)).toBe(0);
    expect(computeSplitElevationDiff(null, 100)).toBeNull();
    expect(computeSplitElevationDiff(100, null)).toBeNull();
  });
});
