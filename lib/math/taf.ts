import {
  FixedTargetResult,
  Kilometers,
  Seconds,
  TafResult,
  TafSplit,
} from "@/types";
import { formatTime } from "@/lib/formatting/time";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";

/**
 * Realiza os cálculos para teste de aptidão física (TAF) baseado em tempo fixo.
 * @param durationMinutes Duração da prova em minutos (ex: 12)
 * @param targetMeters Distância mínima da meta em metros (ex: 2300)
 * @param splitMeters Tamanho de cada parcial em metros (padrão: 400m)
 * @param currentMeters Distância atual alcançada em metros (opcional)
 */
export function calcTaf(
  durationMinutes: number,
  targetMeters: number,
  splitMeters: number = 400,
  currentMeters?: number
): TafResult {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("A duração do teste deve ser maior que zero.");
  }
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) {
    throw new Error("A distância da meta deve ser maior que zero.");
  }
  if (!Number.isFinite(splitMeters) || splitMeters <= 0) {
    throw new Error("O intervalo das parciais deve ser maior que zero.");
  }

  const durationSeconds: Seconds = durationMinutes * 60;
  const targetKm: Kilometers = targetMeters / 1000;
  const paceData = calcPaceFromDistanceAndTime(targetKm, durationSeconds);

  // Distância esperada por minuto (em km)
  const distancePerMinuteKm: Kilometers = targetKm / durationMinutes;

  // Cálculo das parciais (ex: voltas na pista de 400m)
  const splits: TafSplit[] = [];
  const splitKm = splitMeters / 1000;
  let accumulatedDistKm = 0;
  let lap = 1;

  while (accumulatedDistKm < targetKm) {
    const remainingKm = targetKm - accumulatedDistKm;
    const lapDistanceKm = remainingKm < splitKm ? remainingKm : splitKm;
    accumulatedDistKm += lapDistanceKm;

    // Tempo necessário para essa volta = lapDistanceKm * paceSeconds
    const lapTimeSeconds = lapDistanceKm * paceData.paceSeconds;
    const accumulatedTimeSeconds = accumulatedDistKm * paceData.paceSeconds;
    const progressPercent = Math.min(100, (accumulatedDistKm / targetKm) * 100);

    splits.push({
      lap,
      distanceKm: lapDistanceKm,
      accumulatedDistanceKm: accumulatedDistKm,
      lapTimeSeconds,
      lapTimeFormatted: formatTime(lapTimeSeconds),
      accumulatedTimeSeconds,
      accumulatedTimeFormatted: formatTime(accumulatedTimeSeconds),
      progressPercent,
    });

    lap++;
  }

  // Progresso atual (se informado)
  let progressPercent: number | undefined;
  let remainingDistanceKm: number | undefined;
  let currentDistanceKm: Kilometers | undefined;

  if (currentMeters !== undefined && currentMeters >= 0) {
    currentDistanceKm = currentMeters / 1000;
    progressPercent = Math.min(100, (currentMeters / targetMeters) * 100);
    remainingDistanceKm = Math.max(0, (targetMeters - currentMeters) / 1000);
  }

  return {
    paceSeconds: paceData.paceSeconds,
    paceFormatted: paceData.paceFormatted,
    speedKmh: paceData.speedKmh,
    distancePerMinuteKm,
    splits,
    currentDistanceKm,
    targetDistanceKm: targetKm,
    progressPercent,
    remainingDistanceKm,
  };
}

/**
 * Calculadora adicional: meta com distância fixa e tempo máximo.
 * Exemplo: 2400m em até 12 minutos.
 */
export function calcFixedTargetTaf(
  targetMeters: number,
  maxMinutes: number
): FixedTargetResult {
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) {
    throw new Error("A distância da meta deve ser maior que zero.");
  }
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
    throw new Error("O tempo máximo deve ser maior que zero.");
  }

  const targetKm = targetMeters / 1000;
  const maxTimeSeconds = maxMinutes * 60;
  const paceData = calcPaceFromDistanceAndTime(targetKm, maxTimeSeconds);

  return {
    paceSeconds: paceData.paceSeconds,
    paceFormatted: paceData.paceFormatted,
    speedKmh: paceData.speedKmh,
    targetDistanceKm: targetKm,
    maxTimeSeconds,
    maxTimeFormatted: formatTime(maxTimeSeconds),
  };
}
