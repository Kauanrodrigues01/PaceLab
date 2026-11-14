import { describe, it, expect } from "vitest";
import { analyzeSplits, formatPaceDelta } from "@/lib/math/splitsAnalysis";
import { SplitDetail } from "@/types";

describe("Fase 8 — lib/math/splitsAnalysis (Motor de Análise de Splits)", () => {
  it("retorna análise vazia e segura quando não há parciais ou os dados são inválidos", () => {
    const empty = analyzeSplits([]);
    expect(empty.hasSplits).toBe(false);
    expect(empty.totalSplits).toBe(0);
    expect(empty.splits).toEqual([]);
    expect(empty.strategy).toBe("insufficient_data");
    expect(empty.fastestSplit).toBeNull();
    expect(empty.slowestSplit).toBeNull();
    expect(empty.insights).toEqual([]);

    const invalid = analyzeSplits([
      {
        kilometer: 1,
        distanceKm: 0,
        durationSeconds: 0,
        paceSeconds: 0,
        paceFormatted: "0:00",
      },
    ]);
    expect(invalid.hasSplits).toBe(false);
    expect(invalid.totalSplits).toBe(0);
  });

  it("trata parcial única como insufficient_data e 'Parcial única'", () => {
    const single = analyzeSplits([
      {
        kilometer: 1,
        distanceKm: 1.0,
        durationSeconds: 300,
        paceSeconds: 300,
        paceFormatted: "5:00",
      },
    ]);

    expect(single.hasSplits).toBe(true);
    expect(single.totalSplits).toBe(1);
    expect(single.strategy).toBe("insufficient_data");
    expect(single.consistencyLabel).toBe("Parcial única");
    expect(single.avgPaceSeconds).toBe(300);
    expect(single.avgPaceFormatted).toBe("5:00");
    expect(single.fastestSplit?.kilometer).toBe(1);
    expect(single.slowestSplit?.kilometer).toBe(1);
    expect(single.splits[0].deltaFromAvgSeconds).toBe(0);
    expect(single.splits[0].isPartial).toBe(false);
  });

  it("detecta even_split com regularidade máxima quando todos os kms têm o mesmo pace", () => {
    const splits: SplitDetail[] = [1, 2, 3, 4].map((kilometer) => ({
      kilometer,
      distanceKm: 1.0,
      durationSeconds: 300,
      paceSeconds: 300,
      paceFormatted: "5:00",
    }));

    const result = analyzeSplits(splits);
    expect(result.strategy).toBe("even_split");
    expect(result.consistencyScore).toBe(100);
    expect(result.consistencyLabel).toBe("Excelente regularidade");
    expect(result.paceRangeSeconds).toBe(0);
    expect(result.paceStdDevSeconds).toBe(0);
    expect(result.splitDiffSeconds).toBe(0);
  });

  it("identifica negative_split quando a segunda metade é mais rápida que a primeira", () => {
    const splits: SplitDetail[] = [
      { kilometer: 1, distanceKm: 1, durationSeconds: 330, paceSeconds: 330, paceFormatted: "5:30" },
      { kilometer: 2, distanceKm: 1, durationSeconds: 320, paceSeconds: 320, paceFormatted: "5:20" },
      { kilometer: 3, distanceKm: 1, durationSeconds: 295, paceSeconds: 295, paceFormatted: "4:55" },
      { kilometer: 4, distanceKm: 1, durationSeconds: 285, paceSeconds: 285, paceFormatted: "4:45" },
    ];

    const result = analyzeSplits(splits);
    expect(result.strategy).toBe("negative_split");
    expect(result.splitDiffSeconds).toBeLessThan(0);
    expect(result.fastestSplit?.kilometer).toBe(4);
    expect(result.slowestSplit?.kilometer).toBe(1);
    expect(result.totalDistanceKm).toBe(4);
    expect(result.totalDurationSeconds).toBe(1230);
    expect(result.splits[3].cumulativeDurationSeconds).toBe(1230);
    expect(result.splits[3].cumulativeDistanceKm).toBe(4);

    const strategyInsight = result.insights.find((i) => i.id === "strategy");
    expect(strategyInsight?.tone).toBe("positive");
  });

  it("identifica positive_split com alerta quando há queda de ritmo na segunda metade", () => {
    const splits: SplitDetail[] = [
      { kilometer: 1, distanceKm: 1, durationSeconds: 280, paceSeconds: 280, paceFormatted: "4:40" },
      { kilometer: 2, distanceKm: 1, durationSeconds: 290, paceSeconds: 290, paceFormatted: "4:50" },
      { kilometer: 3, distanceKm: 1, durationSeconds: 325, paceSeconds: 325, paceFormatted: "5:25" },
      { kilometer: 4, distanceKm: 1, durationSeconds: 335, paceSeconds: 335, paceFormatted: "5:35" },
    ];

    const result = analyzeSplits(splits);
    expect(result.strategy).toBe("positive_split");
    expect(result.splitDiffSeconds).toBeGreaterThan(0);
    expect(result.fastestSplit?.kilometer).toBe(1);
    expect(result.slowestSplit?.kilometer).toBe(4);

    const strategyInsight = result.insights.find((i) => i.id === "strategy");
    expect(strategyInsight?.tone).toBe("warning");
  });

  it("exclui parcial residual (< 0.5 km) dos extremos de mais rápido/lento mantendo nos totais ponderados", () => {
    const splits: SplitDetail[] = [
      { kilometer: 1, distanceKm: 1.0, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00" },
      { kilometer: 2, distanceKm: 1.0, durationSeconds: 310, paceSeconds: 310, paceFormatted: "5:10" },
      { kilometer: 3, distanceKm: 1.0, durationSeconds: 320, paceSeconds: 320, paceFormatted: "5:20" },
      // Split residual muito curto com sprint final não deve distorcer extremo nem consistência
      { kilometer: 4, distanceKm: 0.25, durationSeconds: 60, paceSeconds: 240, paceFormatted: "4:00" },
    ];

    const result = analyzeSplits(splits);
    expect(result.totalSplits).toBe(4);
    expect(result.totalDistanceKm).toBeCloseTo(3.25, 2);
    expect(result.totalDurationSeconds).toBe(990);
    expect(result.avgPaceSeconds).toBe(Math.round(990 / 3.25));

    expect(result.splits[3].isPartial).toBe(true);
    expect(result.splits[3].isFastest).toBe(false);
    expect(result.fastestSplit?.kilometer).toBe(1);
    expect(result.slowestSplit?.kilometer).toBe(3);
  });

  it("ordena parciais fora de ordem, calcula paceSeconds automaticamente e apura acumulados corretos", () => {
    const result = analyzeSplits([
      { kilometer: 2, distanceKm: 1.0, durationSeconds: 290, paceFormatted: "4:50" },
      { kilometer: 1, distanceKm: 1.0, durationSeconds: 310, paceFormatted: "5:10" },
    ]);

    expect(result.splits.map((s) => s.kilometer)).toEqual([1, 2]);
    expect(result.splits[0].paceSeconds).toBe(310);
    expect(result.splits[0].cumulativeDurationSeconds).toBe(310);
    expect(result.splits[1].paceSeconds).toBe(290);
    expect(result.splits[1].cumulativeDurationSeconds).toBe(600);
    expect(result.strategy).toBe("negative_split");
    expect(result.fastestSplit?.kilometer).toBe(2);
    expect(result.slowestSplit?.kilometer).toBe(1);
  });

  it("pondera FC média por duração e impede que parcial residual (< 0.5 km) distorça deriva cardíaca", () => {
    const result = analyzeSplits([
      { kilometer: 1, distanceKm: 1.0, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 140 },
      { kilometer: 2, distanceKm: 1.0, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 150 },
      { kilometer: 3, distanceKm: 1.0, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 160 },
      { kilometer: 4, distanceKm: 0.1, durationSeconds: 30, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 185 },
    ]);

    expect(result.hasHeartRateData).toBe(true);
    // Média ponderada: (140*300 + 150*300 + 160*300 + 185*30) / 930 = 151 bpm
    expect(result.avgHeartRate).toBe(151);
    // Pico e deriva consideram apenas os 3 kms comparáveis (140 -> 160 = +20 bpm)
    expect(result.maxHeartRateSplit).toEqual({ kilometer: 3, bpm: 160 });
    expect(result.cardiacDriftBpm).toBe(20);
  });

  it("calcula frequência cardíaca, deriva cardíaca e elevação quando sensores estão presentes, e omite quando ausentes", () => {
    const withSensors = analyzeSplits([
      { kilometer: 1, distanceKm: 1, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 142, elevationDiffM: 12 },
      { kilometer: 2, distanceKm: 1, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: 146, elevationDiffM: -5 },
      { kilometer: 3, distanceKm: 1, durationSeconds: 305, paceSeconds: 305, paceFormatted: "5:05", avgHeartRate: 158, elevationDiffM: 18 },
      { kilometer: 4, distanceKm: 1, durationSeconds: 305, paceSeconds: 305, paceFormatted: "5:05", avgHeartRate: 166, elevationDiffM: -10 },
    ]);

    expect(withSensors.hasHeartRateData).toBe(true);
    expect(withSensors.avgHeartRate).toBe(153);
    expect(withSensors.minHeartRateSplit).toEqual({ kilometer: 1, bpm: 142 });
    expect(withSensors.maxHeartRateSplit).toEqual({ kilometer: 4, bpm: 166 });
    expect(withSensors.cardiacDriftBpm).toBe(18);
    expect(withSensors.insights.some((i) => i.id === "heart_rate")).toBe(true);

    expect(withSensors.hasElevationData).toBe(true);
    expect(withSensors.totalElevationGainM).toBe(30);
    expect(withSensors.totalElevationLossM).toBe(15);
    expect(withSensors.netElevationM).toBe(15);
    expect(withSensors.steepestClimbSplit).toEqual({ kilometer: 3, elevationDiffM: 18 });
    expect(withSensors.steepestDescentSplit).toEqual({ kilometer: 4, elevationDiffM: -10 });
    expect(withSensors.insights.some((i) => i.id === "elevation")).toBe(true);

    const withoutSensors = analyzeSplits([
      { kilometer: 1, distanceKm: 1, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: null, elevationDiffM: null },
      { kilometer: 2, distanceKm: 1, durationSeconds: 300, paceSeconds: 300, paceFormatted: "5:00", avgHeartRate: null, elevationDiffM: null },
    ]);

    expect(withoutSensors.hasHeartRateData).toBe(false);
    expect(withoutSensors.avgHeartRate).toBeNull();
    expect(withoutSensors.cardiacDriftBpm).toBeNull();
    expect(withoutSensors.hasElevationData).toBe(false);
    expect(withoutSensors.netElevationM).toBeNull();
    expect(withoutSensors.insights.some((i) => i.id === "heart_rate")).toBe(false);
    expect(withoutSensors.insights.some((i) => i.id === "elevation")).toBe(false);
  });

  it("formata deltas de pace com precisão e arredondamento", () => {
    expect(formatPaceDelta(0)).toBe("0 s/km");
    expect(formatPaceDelta(-0)).toBe("0 s/km");
    expect(formatPaceDelta(12.4)).toBe("+12 s/km");
    expect(formatPaceDelta(-7.6)).toBe("-8 s/km");
  });
});
