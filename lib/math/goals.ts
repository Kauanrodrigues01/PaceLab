import { GoalResult, GoalSplit, Kilometers, Seconds, SecondsPerKm } from "@/types";
import { formatPace, formatTime } from "@/lib/formatting/time";
import { calcPaceFromDistanceAndTime, calcSpeedFromPace } from "@/lib/math/pace";

export interface GoalFromPaceParams {
  distanceKm: Kilometers;
  paceSeconds: SecondsPerKm;
  splitDistanceMeters?: number; // padrão: 1000m (1 km)
}

export interface GoalFromTimeParams {
  distanceKm: Kilometers;
  totalTimeSeconds: Seconds;
  splitDistanceMeters?: number;
}

/**
 * Calcula metas e parciais a partir da distância e do pace-alvo.
 */
export function calcGoalFromPace({
  distanceKm,
  paceSeconds,
  splitDistanceMeters = 1000,
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
  const splits = generateGoalSplits(distanceKm, paceSeconds, splitDistanceMeters);

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
  const splits = generateGoalSplits(distanceKm, paceData.paceSeconds, splitDistanceMeters);

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
 * Gera a tabela de splits/parciais de acordo com a distância do intervalo.
 */
function generateGoalSplits(
  totalDistanceKm: Kilometers,
  paceSeconds: SecondsPerKm,
  splitDistanceMeters: number
): GoalSplit[] {
  const splits: GoalSplit[] = [];
  const splitKm = splitDistanceMeters / 1000;
  let accumulatedDist = 0;
  let index = 1;

  while (accumulatedDist < totalDistanceKm) {
    const remainingKm = totalDistanceKm - accumulatedDist;
    const currentSplitKm = remainingKm < splitKm ? remainingKm : splitKm;
    accumulatedDist += currentSplitKm;

    const splitTimeSeconds = currentSplitKm * paceSeconds;
    const accumulatedTimeSeconds = accumulatedDist * paceSeconds;

    splits.push({
      index,
      distanceKm: currentSplitKm,
      accumulatedDistanceKm: accumulatedDist,
      splitTimeSeconds,
      splitTimeFormatted: formatTime(splitTimeSeconds),
      accumulatedTimeSeconds,
      accumulatedTimeFormatted: formatTime(accumulatedTimeSeconds),
    });

    index++;
  }

  return splits;
}
