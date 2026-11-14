import { SplitDetail } from "@/types";
import { formatPace } from "@/lib/formatting/time";

export type SplitPaceStrategy =
  | "negative_split"
  | "even_split"
  | "positive_split"
  | "insufficient_data";

export interface NormalizedSplit {
  kilometer: number;
  label: string;
  shortLabel: string;
  distanceKm: number;
  durationSeconds: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate: number | null;
  elevationDiffM: number | null;
  cumulativeDistanceKm: number;
  cumulativeDurationSeconds: number;
  deltaFromAvgSeconds: number;
  isFastest: boolean;
  isSlowest: boolean;
  isPartial: boolean;
}

export interface SplitInsightItem {
  id: "strategy" | "extremes" | "consistency" | "heart_rate" | "elevation";
  title: string;
  value: string;
  description: string;
  tone: "positive" | "neutral" | "warning";
}

export interface SplitsAnalysis {
  hasSplits: boolean;
  totalSplits: number;
  splits: NormalizedSplit[];
  totalDistanceKm: number;
  totalDurationSeconds: number;
  avgPaceSeconds: number;
  avgPaceFormatted: string;
  fastestSplit: NormalizedSplit | null;
  slowestSplit: NormalizedSplit | null;
  paceRangeSeconds: number;
  paceStdDevSeconds: number;
  consistencyScore: number;
  consistencyLabel: string;
  firstHalfAvgPaceSeconds: number | null;
  secondHalfAvgPaceSeconds: number | null;
  firstHalfAvgPaceFormatted: string | null;
  secondHalfAvgPaceFormatted: string | null;
  splitDiffSeconds: number | null;
  strategy: SplitPaceStrategy;
  strategyLabel: string;
  hasHeartRateData: boolean;
  avgHeartRate: number | null;
  minHeartRateSplit: { kilometer: number; bpm: number } | null;
  maxHeartRateSplit: { kilometer: number; bpm: number } | null;
  cardiacDriftBpm: number | null;
  hasElevationData: boolean;
  totalElevationGainM: number | null;
  totalElevationLossM: number | null;
  netElevationM: number | null;
  steepestClimbSplit: { kilometer: number; elevationDiffM: number } | null;
  steepestDescentSplit: { kilometer: number; elevationDiffM: number } | null;
  insights: SplitInsightItem[];
}

/** Formata diferença de pace relativa à média ou entre metades em s/km (ex: "-8 s/km", "+12 s/km"). */
export function formatPaceDelta(deltaSeconds: number): string {
  const rounded = Math.round(deltaSeconds);
  if (rounded === 0 || Object.is(rounded, -0)) return "0 s/km";
  return rounded > 0 ? `+${rounded} s/km` : `${rounded} s/km`;
}

function getConsistencyLabel(score: number, comparableCount: number): string {
  if (comparableCount < 2) return "Parcial única";
  if (score >= 85) return "Excelente regularidade";
  if (score >= 65) return "Boa consistência";
  if (score >= 40) return "Ritmo variado";
  return "Alta variação / Intervalado";
}

function computeWeightedPaceSeconds(
  items: Array<{ distanceKm: number; durationSeconds: number }>
): number {
  const dist = items.reduce((acc, s) => acc + s.distanceKm, 0);
  const dur = items.reduce((acc, s) => acc + s.durationSeconds, 0);
  if (dist <= 0 || dur <= 0) return 0;
  return Math.max(1, Math.round(dur / dist));
}

function buildStrategySummary(
  comparable: NormalizedSplit[]
): {
  firstHalfAvgPaceSeconds: number | null;
  secondHalfAvgPaceSeconds: number | null;
  firstHalfAvgPaceFormatted: string | null;
  secondHalfAvgPaceFormatted: string | null;
  splitDiffSeconds: number | null;
  strategy: SplitPaceStrategy;
  strategyLabel: string;
} {
  if (comparable.length < 2) {
    return {
      firstHalfAvgPaceSeconds: null,
      secondHalfAvgPaceSeconds: null,
      firstHalfAvgPaceFormatted: null,
      secondHalfAvgPaceFormatted: null,
      splitDiffSeconds: null,
      strategy: "insufficient_data",
      strategyLabel: "Parcial única",
    };
  }

  const halfSize = Math.floor(comparable.length / 2);
  const firstHalf = comparable.slice(0, halfSize);
  const secondHalf = comparable.slice(comparable.length - halfSize);

  const firstPace = computeWeightedPaceSeconds(firstHalf);
  const secondPace = computeWeightedPaceSeconds(secondHalf);
  const diff = secondPace - firstPace;

  let strategy: SplitPaceStrategy = "even_split";
  let strategyLabel = "Ritmo Uniforme";

  if (diff <= -3) {
    strategy = "negative_split";
    strategyLabel = "Split Negativo";
  } else if (diff >= 3) {
    strategy = "positive_split";
    strategyLabel = "Split Positivo";
  }

  return {
    firstHalfAvgPaceSeconds: firstPace,
    secondHalfAvgPaceSeconds: secondPace,
    firstHalfAvgPaceFormatted: formatPace(firstPace),
    secondHalfAvgPaceFormatted: formatPace(secondPace),
    splitDiffSeconds: diff,
    strategy,
    strategyLabel,
  };
}

/**
 * Analisa uma sequência de parciais (`splits`), calculando consistência, extremos,
 * estratégia de prova (split negativo/uniforme/positivo), deriva cardíaca e altimetria.
 */
export function analyzeSplits(
  rawSplits: SplitDetail[] | null | undefined
): SplitsAnalysis {
  const validInput = (rawSplits ?? []).filter(
    (s) =>
      Number.isFinite(s.kilometer) &&
      s.kilometer >= 1 &&
      Number.isFinite(s.durationSeconds) &&
      s.durationSeconds > 0
  );

  if (validInput.length === 0) {
    return {
      hasSplits: false,
      totalSplits: 0,
      splits: [],
      totalDistanceKm: 0,
      totalDurationSeconds: 0,
      avgPaceSeconds: 0,
      avgPaceFormatted: "--:--",
      fastestSplit: null,
      slowestSplit: null,
      paceRangeSeconds: 0,
      paceStdDevSeconds: 0,
      consistencyScore: 0,
      consistencyLabel: "Sem dados",
      firstHalfAvgPaceSeconds: null,
      secondHalfAvgPaceSeconds: null,
      firstHalfAvgPaceFormatted: null,
      secondHalfAvgPaceFormatted: null,
      splitDiffSeconds: null,
      strategy: "insufficient_data",
      strategyLabel: "Sem dados",
      hasHeartRateData: false,
      avgHeartRate: null,
      minHeartRateSplit: null,
      maxHeartRateSplit: null,
      cardiacDriftBpm: null,
      hasElevationData: false,
      totalElevationGainM: null,
      totalElevationLossM: null,
      netElevationM: null,
      steepestClimbSplit: null,
      steepestDescentSplit: null,
      insights: [],
    };
  }

  const orderedInput = [...validInput].sort(
    (a, b) => a.kilometer - b.kilometer
  );

  let accDistKm = 0;
  let accDurSec = 0;

  const baseSplits: NormalizedSplit[] = orderedInput.map((s) => {
    const distanceKm =
      typeof s.distanceKm === "number" &&
      Number.isFinite(s.distanceKm) &&
      s.distanceKm > 0
        ? Number(s.distanceKm.toFixed(3))
        : 1;
    const durationSeconds = Math.max(1, Math.round(s.durationSeconds));
    const paceSeconds =
      typeof s.paceSeconds === "number" &&
      Number.isFinite(s.paceSeconds) &&
      s.paceSeconds > 0
        ? Math.round(s.paceSeconds)
        : Math.max(1, Math.round(durationSeconds / distanceKm));
    const paceFormatted = s.paceFormatted || formatPace(paceSeconds);
    const avgHeartRate =
      typeof s.avgHeartRate === "number" &&
      Number.isFinite(s.avgHeartRate) &&
      s.avgHeartRate > 0
        ? Math.round(s.avgHeartRate)
        : null;
    const elevationDiffM =
      typeof s.elevationDiffM === "number" && Number.isFinite(s.elevationDiffM)
        ? Math.round(s.elevationDiffM)
        : null;

    accDistKm = Number((accDistKm + distanceKm).toFixed(3));
    accDurSec += durationSeconds;

    return {
      kilometer: Math.round(s.kilometer),
      label: `Km ${Math.round(s.kilometer)}`,
      shortLabel: `K${Math.round(s.kilometer)}`,
      distanceKm,
      durationSeconds,
      paceSeconds,
      paceFormatted,
      avgHeartRate,
      elevationDiffM,
      cumulativeDistanceKm: accDistKm,
      cumulativeDurationSeconds: accDurSec,
      deltaFromAvgSeconds: 0,
      isFastest: false,
      isSlowest: false,
      isPartial: distanceKm < 0.95,
    };
  });

  const avgPaceSeconds = computeWeightedPaceSeconds(baseSplits);
  const avgPaceFormatted = avgPaceSeconds > 0 ? formatPace(avgPaceSeconds) : "--:--";

  // Exclui trechos residuais (< 500 m) da comparação se houver >= 2 parciais substanciais
  const substantialSplits = baseSplits.filter((s) => s.distanceKm >= 0.5);
  const comparableSplits =
    substantialSplits.length >= 2 ? substantialSplits : baseSplits;

  let fastestBase = comparableSplits[0];
  let slowestBase = comparableSplits[0];
  for (const s of comparableSplits) {
    if (s.paceSeconds < fastestBase.paceSeconds) fastestBase = s;
    if (s.paceSeconds > slowestBase.paceSeconds) slowestBase = s;
  }

  const paceRangeSeconds = Math.max(
    0,
    slowestBase.paceSeconds - fastestBase.paceSeconds
  );

  // Desvio padrão populacional em relação ao pace médio das parciais comparáveis
  const compMean =
    comparableSplits.reduce((acc, s) => acc + s.paceSeconds, 0) /
    comparableSplits.length;
  const variance =
    comparableSplits.reduce(
      (acc, s) => acc + Math.pow(s.paceSeconds - compMean, 2),
      0
    ) / comparableSplits.length;
  const paceStdDevSeconds = Number(Math.sqrt(variance).toFixed(1));

  const cv = compMean > 0 ? paceStdDevSeconds / compMean : 0;
  const consistencyScore =
    comparableSplits.length < 2
      ? 100
      : Math.round(Math.max(0, Math.min(100, 100 - cv * 500)));
  const consistencyLabel = getConsistencyLabel(
    consistencyScore,
    comparableSplits.length
  );

  const fastestIdx = baseSplits.indexOf(fastestBase);
  const slowestIdx = baseSplits.indexOf(slowestBase);

  // Preenche deltas e destaca apenas se houver variação real (> 0s)
  const splits: NormalizedSplit[] = baseSplits.map((s, idx) => ({
    ...s,
    deltaFromAvgSeconds: s.paceSeconds - avgPaceSeconds,
    isFastest: paceRangeSeconds > 0 && idx === fastestIdx,
    isSlowest: paceRangeSeconds > 0 && idx === slowestIdx,
  }));

  const fastestSplit = fastestIdx >= 0 ? splits[fastestIdx] : null;
  const slowestSplit = slowestIdx >= 0 ? splits[slowestIdx] : null;

  const strategySummary = buildStrategySummary(comparableSplits);

  // Análise de Frequência Cardíaca (ponderada por duração para evitar distorção em parciais curtas)
  const hrSplits = splits.filter((s) => s.avgHeartRate !== null);
  const hasHeartRateData = hrSplits.length > 0;
  let avgHeartRate: number | null = null;
  let minHeartRateSplit: { kilometer: number; bpm: number } | null = null;
  let maxHeartRateSplit: { kilometer: number; bpm: number } | null = null;
  let cardiacDriftBpm: number | null = null;

  if (hasHeartRateData) {
    const totalHrDuration = hrSplits.reduce(
      (acc, s) => acc + s.durationSeconds,
      0
    );
    avgHeartRate = Math.round(
      totalHrDuration > 0
        ? hrSplits.reduce(
            (acc, s) => acc + (s.avgHeartRate as number) * s.durationSeconds,
            0
          ) / totalHrDuration
        : hrSplits.reduce((acc, s) => acc + (s.avgHeartRate as number), 0) /
            hrSplits.length
    );

    const substantialHrSplits = hrSplits.filter((s) => !s.isPartial || s.distanceKm >= 0.5);
    const comparableHrSplits =
      substantialHrSplits.length >= 2 ? substantialHrSplits : hrSplits;

    const sortedHr = [...comparableHrSplits].sort(
      (a, b) => (a.avgHeartRate as number) - (b.avgHeartRate as number)
    );
    minHeartRateSplit = {
      kilometer: sortedHr[0].kilometer,
      bpm: sortedHr[0].avgHeartRate as number,
    };
    maxHeartRateSplit = {
      kilometer: sortedHr[sortedHr.length - 1].kilometer,
      bpm: sortedHr[sortedHr.length - 1].avgHeartRate as number,
    };

    if (comparableHrSplits.length >= 2) {
      const halfHr = Math.floor(comparableHrSplits.length / 2);
      const firstHalfHr = comparableHrSplits.slice(0, halfHr);
      const secondHalfHr = comparableHrSplits.slice(
        comparableHrSplits.length - halfHr
      );
      const firstDur = firstHalfHr.reduce((acc, s) => acc + s.durationSeconds, 0);
      const secondDur = secondHalfHr.reduce((acc, s) => acc + s.durationSeconds, 0);

      const firstHrAvg =
        firstDur > 0
          ? firstHalfHr.reduce(
              (acc, s) => acc + (s.avgHeartRate as number) * s.durationSeconds,
              0
            ) / firstDur
          : firstHalfHr.reduce((acc, s) => acc + (s.avgHeartRate as number), 0) /
            firstHalfHr.length;
      const secondHrAvg =
        secondDur > 0
          ? secondHalfHr.reduce(
              (acc, s) => acc + (s.avgHeartRate as number) * s.durationSeconds,
              0
            ) / secondDur
          : secondHalfHr.reduce((acc, s) => acc + (s.avgHeartRate as number), 0) /
            secondHalfHr.length;
      cardiacDriftBpm = Math.round(secondHrAvg - firstHrAvg);
    }
  }

  // Análise de Elevação
  const eleSplits = splits.filter((s) => s.elevationDiffM !== null);
  const hasElevationData = eleSplits.length > 0;
  let totalElevationGainM: number | null = null;
  let totalElevationLossM: number | null = null;
  let netElevationM: number | null = null;
  let steepestClimbSplit: { kilometer: number; elevationDiffM: number } | null =
    null;
  let steepestDescentSplit: {
    kilometer: number;
    elevationDiffM: number;
  } | null = null;

  if (hasElevationData) {
    let gain = 0;
    let loss = 0;
    let net = 0;
    let bestClimb: NormalizedSplit | null = null;
    let bestDescent: NormalizedSplit | null = null;

    for (const s of eleSplits) {
      const ele = s.elevationDiffM as number;
      net += ele;
      if (ele > 0) {
        gain += ele;
        if (!bestClimb || ele > (bestClimb.elevationDiffM as number)) {
          bestClimb = s;
        }
      } else if (ele < 0) {
        loss += Math.abs(ele);
        if (!bestDescent || ele < (bestDescent.elevationDiffM as number)) {
          bestDescent = s;
        }
      }
    }

    totalElevationGainM = gain;
    totalElevationLossM = loss;
    netElevationM = net;
    steepestClimbSplit = bestClimb
      ? {
          kilometer: bestClimb.kilometer,
          elevationDiffM: bestClimb.elevationDiffM as number,
        }
      : null;
    steepestDescentSplit = bestDescent
      ? {
          kilometer: bestDescent.kilometer,
          elevationDiffM: bestDescent.elevationDiffM as number,
        }
      : null;
  }

  // Insights estruturados em português
  const insights: SplitInsightItem[] = [];

  if (
    strategySummary.strategy !== "insufficient_data" &&
    strategySummary.splitDiffSeconds !== null
  ) {
    const absDiff = Math.abs(strategySummary.splitDiffSeconds);
    let tone: "positive" | "neutral" | "warning" = "neutral";
    let description = `Ritmo equilibrado entre a 1ª (${strategySummary.firstHalfAvgPaceFormatted}/km) e a 2ª metade (${strategySummary.secondHalfAvgPaceFormatted}/km).`;

    if (strategySummary.strategy === "negative_split") {
      tone = "positive";
      description = `Excelente controle: você correu a 2ª metade ${absDiff} s/km mais rápido (${strategySummary.secondHalfAvgPaceFormatted}/km vs ${strategySummary.firstHalfAvgPaceFormatted}/km).`;
    } else if (strategySummary.strategy === "positive_split") {
      tone = absDiff >= 15 ? "warning" : "neutral";
      description = `Você desacelerou ${absDiff} s/km na 2ª metade (${strategySummary.secondHalfAvgPaceFormatted}/km vs ${strategySummary.firstHalfAvgPaceFormatted}/km).`;
    }

    insights.push({
      id: "strategy",
      title: "Estratégia de Ritmo",
      value:
        strategySummary.splitDiffSeconds === 0
          ? strategySummary.strategyLabel
          : `${strategySummary.strategyLabel} (${formatPaceDelta(strategySummary.splitDiffSeconds)})`,
      description,
      tone,
    });
  } else if (fastestSplit) {
    insights.push({
      id: "strategy",
      title: "Parcial Registrada",
      value: `${fastestSplit.label} • ${fastestSplit.paceFormatted}/km`,
      description:
        "Treino com apenas 1 parcial comparável; registre múltiplas parciais para análise de split negativo/positivo.",
      tone: "neutral",
    });
  }

  if (fastestSplit && slowestSplit) {
    insights.push({
      id: "extremes",
      title: "Melhor vs Pior Parcial",
      value:
        paceRangeSeconds === 0
          ? `${fastestSplit.paceFormatted}/km constante`
          : `${fastestSplit.label} (${fastestSplit.paceFormatted}) • Δ ${paceRangeSeconds}s`,
      description:
        paceRangeSeconds === 0
          ? `Todas as parciais comparáveis mantiveram o mesmo ritmo médio (${fastestSplit.paceFormatted}/km).`
          : `Mais rápida no ${fastestSplit.label} (${fastestSplit.paceFormatted}/km) e mais lenta no ${slowestSplit.label} (${slowestSplit.paceFormatted}/km).`,
      tone: paceRangeSeconds <= 15 ? "positive" : "neutral",
    });
  }

  insights.push({
    id: "consistency",
    title: "Consistência de Ritmo",
    value: `${consistencyScore}% • ${consistencyLabel}`,
    description:
      comparableSplits.length < 2
        ? `Pace médio ponderado de ${avgPaceFormatted}/km na sessão.`
        : `Desvio padrão de ±${paceStdDevSeconds.toFixed(1)} s/km em relação ao pace médio de ${avgPaceFormatted}/km.`,
    tone:
      consistencyScore >= 75
        ? "positive"
        : consistencyScore >= 45
          ? "neutral"
          : "warning",
  });

  if (hasHeartRateData && avgHeartRate !== null && maxHeartRateSplit) {
    const driftText =
      cardiacDriftBpm !== null
        ? ` Deriva cardíaca de ${cardiacDriftBpm >= 0 ? "+" : ""}${cardiacDriftBpm} bpm entre metades.`
        : "";
    insights.push({
      id: "heart_rate",
      title: "FC por Parcial",
      value: `${avgHeartRate} bpm méd. (pico ${maxHeartRateSplit.bpm})`,
      description: `Pico cardíaco no Km ${maxHeartRateSplit.kilometer} (${maxHeartRateSplit.bpm} bpm).${driftText}`,
      tone:
        cardiacDriftBpm !== null && cardiacDriftBpm >= 12 ? "warning" : "neutral",
    });
  }

  if (
    hasElevationData &&
    totalElevationGainM !== null &&
    totalElevationLossM !== null
  ) {
    const climbDesc = steepestClimbSplit
      ? `Maior subida no Km ${steepestClimbSplit.kilometer} (+${steepestClimbSplit.elevationDiffM} m)`
      : "Sem subidas acentuadas";
    const descentDesc = steepestDescentSplit
      ? ` e maior descida no Km ${steepestDescentSplit.kilometer} (${steepestDescentSplit.elevationDiffM} m)`
      : "";
    insights.push({
      id: "elevation",
      title: "Altimetria por Parcial",
      value: `+${totalElevationGainM} m / -${totalElevationLossM} m`,
      description: `${climbDesc}${descentDesc}.`,
      tone: "neutral",
    });
  }

  return {
    hasSplits: true,
    totalSplits: splits.length,
    splits,
    totalDistanceKm: accDistKm,
    totalDurationSeconds: accDurSec,
    avgPaceSeconds,
    avgPaceFormatted,
    fastestSplit,
    slowestSplit,
    paceRangeSeconds,
    paceStdDevSeconds,
    consistencyScore,
    consistencyLabel,
    ...strategySummary,
    hasHeartRateData,
    avgHeartRate,
    minHeartRateSplit,
    maxHeartRateSplit,
    cardiacDriftBpm,
    hasElevationData,
    totalElevationGainM,
    totalElevationLossM,
    netElevationM,
    steepestClimbSplit,
    steepestDescentSplit,
    insights,
  };
}
