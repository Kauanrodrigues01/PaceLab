import { GoalResult, GoalSplit, Kilometers, PacingStrategy, Seconds, SecondsPerKm } from "@/types";
import { formatPace, formatTime } from "@/lib/formatting/time";
import { calcPaceFromDistanceAndTime, calcSpeedFromPace } from "@/lib/math/pace";

export interface GoalFromPaceParams {
  distanceKm: Kilometers;
  paceSeconds: SecondsPerKm;
  splitDistanceMeters?: number; // padrão: 1000m (1 km)
  pacingStrategy?: PacingStrategy;
}

export interface GoalFromTimeParams {
  distanceKm: Kilometers;
  totalTimeSeconds: Seconds;
  splitDistanceMeters?: number;
  pacingStrategy?: PacingStrategy;
}

/**
 * Calcula metas e parciais a partir da distância e do pace-alvo.
 */
export function calcGoalFromPace({
  distanceKm,
  paceSeconds,
  splitDistanceMeters = 1000,
  pacingStrategy = "even",
}: GoalFromPaceParams): GoalResult {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error("A distância deve ser maior que zero.");
  }
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    throw new Error("O pace deve ser maior que zero.");
  }
  if (!Number.isFinite(splitDistanceMeters) || splitDistanceMeters <= 0) {
    throw new Error("O intervalo das parciais deve ser maior que zero.");
  }

  const totalTimeSeconds = distanceKm * paceSeconds;
  const speedKmh = calcSpeedFromPace(paceSeconds);
  const splits = generateGoalSplits(distanceKm, paceSeconds, splitDistanceMeters, pacingStrategy);

  return {
    totalTimeSeconds,
    totalTimeFormatted: formatTime(totalTimeSeconds),
    paceSeconds,
    paceFormatted: formatPace(paceSeconds),
    speedKmh,
    splits,
  };
}

/**
 * Calcula metas e parciais a partir da distância e do tempo total alvo.
 */
export function calcGoalFromTime({
  distanceKm,
  totalTimeSeconds,
  splitDistanceMeters = 1000,
  pacingStrategy = "even",
}: GoalFromTimeParams): GoalResult {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error("A distância deve ser maior que zero.");
  }
  if (!Number.isFinite(totalTimeSeconds) || totalTimeSeconds <= 0) {
    throw new Error("O tempo total deve ser maior que zero.");
  }
  if (!Number.isFinite(splitDistanceMeters) || splitDistanceMeters <= 0) {
    throw new Error("O intervalo das parciais deve ser maior que zero.");
  }

  const paceData = calcPaceFromDistanceAndTime(distanceKm, totalTimeSeconds);
  const splits = generateGoalSplits(distanceKm, paceData.paceSeconds, splitDistanceMeters, pacingStrategy);

  return {
    totalTimeSeconds,
    totalTimeFormatted: formatTime(totalTimeSeconds),
    paceSeconds: paceData.paceSeconds,
    paceFormatted: paceData.paceFormatted,
    speedKmh: paceData.speedKmh,
    splits,
  };
}

/**
 * Gera a tabela de splits/parciais de acordo com a distância do intervalo e estratégia de ritmo.
 */
function generateGoalSplits(
  totalDistanceKm: Kilometers,
  paceSeconds: SecondsPerKm,
  splitDistanceMeters: number,
  strategy: PacingStrategy = "even"
): GoalSplit[] {
  const splitKm = splitDistanceMeters / 1000;
  const rawSegments: { index: number; distanceKm: number; midDist: number }[] = [];
  let accumulatedDist = 0;
  let index = 1;

  while (accumulatedDist < totalDistanceKm) {
    const remainingKm = totalDistanceKm - accumulatedDist;
    const currentSplitKm = remainingKm < splitKm ? remainingKm : splitKm;
    const midDist = accumulatedDist + currentSplitKm / 2;
    accumulatedDist += currentSplitKm;

    rawSegments.push({
      index,
      distanceKm: currentSplitKm,
      midDist,
    });
    index++;
  }

  const numSplits = rawSegments.length;
  const rawFactors = rawSegments.map((seg, i) => {
    if (strategy === "negative" && numSplits > 1) {
      // 1ª metade ~2.5% mais lenta (pace maior), 2ª metade ~2.5% mais rápida (pace menor)
      return seg.midDist <= totalDistanceKm / 2 ? 1.025 : 0.975;
    }
    if (strategy === "progressive" && numSplits > 1) {
      // Acelera progressivamente de +3.5% até -3.5%
      const progress = i / (numSplits - 1); // 0 a 1
      return 1.035 - progress * 0.07;
    }
    return 1.0;
  });

  const totalExactTime = totalDistanceKm * paceSeconds;
  const rawTotalWeighted = rawSegments.reduce(
    (acc, seg, i) => acc + seg.distanceKm * paceSeconds * rawFactors[i],
    0
  );
  const scale = totalExactTime / rawTotalWeighted;

  const splits: GoalSplit[] = [];
  let currentAccumDist = 0;
  let currentAccumTime = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    currentAccumDist += seg.distanceKm;

    let splitTimeSeconds: number;
    if (i === rawSegments.length - 1) {
      // O último split absorve qualquer resíduo fracionário para cravar o total
      splitTimeSeconds = Math.max(1, totalExactTime - currentAccumTime);
    } else {
      splitTimeSeconds = Math.max(1, Math.round(seg.distanceKm * paceSeconds * rawFactors[i] * scale));
    }

    currentAccumTime += splitTimeSeconds;
    const currentPaceSec = splitTimeSeconds / seg.distanceKm;
    const strategyDiffPercent = ((currentPaceSec - paceSeconds) / paceSeconds) * 100;

    splits.push({
      index: seg.index,
      distanceKm: seg.distanceKm,
      accumulatedDistanceKm: currentAccumDist,
      splitTimeSeconds,
      splitTimeFormatted: formatTime(splitTimeSeconds),
      accumulatedTimeSeconds: currentAccumTime,
      accumulatedTimeFormatted: formatTime(currentAccumTime),
      paceFormatted: formatPace(currentPaceSec),
      strategyDiffPercent: Math.round(strategyDiffPercent * 10) / 10,
    });
  }

  return splits;
}
