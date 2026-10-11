import {
  Kilometers,
  PaceAverageResult,
  PaceEntry,
  Seconds,
  SecondsPerKm,
} from "@/types";
import { formatPace, formatTime, parsePace } from "@/lib/formatting/time";
import { calcSpeedFromPace } from "@/lib/math/pace";

const PROJECTION_DISTANCES: { key: string; km: Kilometers }[] = [
  { key: "1km", km: 1 },
  { key: "1.6km", km: 1.6 },
  { key: "2km", km: 2 },
  { key: "2.3km", km: 2.3 },
  { key: "3km", km: 3 },
  { key: "5km", km: 5 },
  { key: "10km", km: 10 },
];

/**
 * Calcula estatísticas a partir de uma lista de paces com trechos de mesma distância (peso igual).
 * @param paceStrings Array de strings de pace (ex: ["6:13", "6:33"])
 */
export function calcAveragePaces(paceStrings: string[]): PaceAverageResult {
  const validPaces = paceStrings
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parsePace(s));

  if (validPaces.length === 0) {
    throw new Error("Pelo menos um pace válido deve ser informado.");
  }

  const count = validPaces.length;
  const totalSeconds = validPaces.reduce((acc, curr) => acc + curr, 0);
  const averagePaceSeconds = totalSeconds / count;

  let fastestPaceSeconds = validPaces[0];
  let slowestPaceSeconds = validPaces[0];

  for (const pace of validPaces) {
    if (pace < fastestPaceSeconds) fastestPaceSeconds = pace;
    if (pace > slowestPaceSeconds) slowestPaceSeconds = pace;
  }

  const differenceSeconds = slowestPaceSeconds - fastestPaceSeconds;
  const speedKmh = calcSpeedFromPace(averagePaceSeconds);

  // Projeção de tempos estimados
  const estimatedTimes: Record<string, string> = {};
  for (const { key, km } of PROJECTION_DISTANCES) {
    const totalTime = averagePaceSeconds * km;
    estimatedTimes[key] = formatTime(totalTime);
  }

  return {
    count,
    averagePaceSeconds,
    averagePaceFormatted: formatPace(averagePaceSeconds),
    speedKmh,
    fastestPaceSeconds,
    fastestPaceFormatted: formatPace(fastestPaceSeconds),
    slowestPaceSeconds,
    slowestPaceFormatted: formatPace(slowestPaceSeconds),
    differenceSeconds,
    differenceFormatted: formatPace(differenceSeconds),
    estimatedTimes,
  };
}

/**
 * Calcula a média ponderada de paces quando cada parcial possui uma distância diferente.
 * Pace médio = Tempo Total / Distância Total
 * @param entries Array de parciais com pace e distância em km
 */
export function calcWeightedAveragePaces(entries: PaceEntry[]): PaceAverageResult {
  const validEntries = entries
    .filter((e) => e.paceStr && e.paceStr.trim().length > 0)
    .map((e) => ({
      paceSeconds: parsePace(e.paceStr),
      distanceKm: e.distanceKm !== undefined && e.distanceKm > 0 ? e.distanceKm : 1,
    }));

  if (validEntries.length === 0) {
    throw new Error("Pelo menos uma parcial válida deve ser informada.");
  }

  let totalDistanceKm = 0;
  let totalTimeSeconds: Seconds = 0;
  let fastestPaceSeconds = validEntries[0].paceSeconds;
  let slowestPaceSeconds = validEntries[0].paceSeconds;

  for (const entry of validEntries) {
    const stageTime = entry.paceSeconds * entry.distanceKm;
    totalTimeSeconds += stageTime;
    totalDistanceKm += entry.distanceKm;

    if (entry.paceSeconds < fastestPaceSeconds) fastestPaceSeconds = entry.paceSeconds;
    if (entry.paceSeconds > slowestPaceSeconds) slowestPaceSeconds = entry.paceSeconds;
  }

  const averagePaceSeconds: SecondsPerKm = totalTimeSeconds / totalDistanceKm;
  const differenceSeconds = slowestPaceSeconds - fastestPaceSeconds;
  const speedKmh = calcSpeedFromPace(averagePaceSeconds);

  const estimatedTimes: Record<string, string> = {};
  for (const { key, km } of PROJECTION_DISTANCES) {
    const totalTime = averagePaceSeconds * km;
    estimatedTimes[key] = formatTime(totalTime);
  }

  return {
    count: validEntries.length,
    averagePaceSeconds,
    averagePaceFormatted: formatPace(averagePaceSeconds),
    speedKmh,
    fastestPaceSeconds,
    fastestPaceFormatted: formatPace(fastestPaceSeconds),
    slowestPaceSeconds,
    slowestPaceFormatted: formatPace(slowestPaceSeconds),
    differenceSeconds,
    differenceFormatted: formatPace(differenceSeconds),
    estimatedTimes,
  };
}
