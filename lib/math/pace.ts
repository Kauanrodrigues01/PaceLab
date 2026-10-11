import { Kilometers, KmPerHour, PaceResult, Seconds, SecondsPerKm } from "@/types";
import { formatPace } from "@/lib/formatting/time";

/**
 * Calcula o pace e velocidade média a partir de distância e tempo.
 * @param distKm Distância em quilômetros (> 0)
 * @param timeSeconds Tempo total em segundos (> 0)
 * @example calcPaceFromDistanceAndTime(3, 1200) -> { paceSeconds: 400, paceFormatted: "6:40", speedKmh: 9 }
 */
export function calcPaceFromDistanceAndTime(
  distKm: Kilometers,
  timeSeconds: Seconds
): PaceResult {
  if (!Number.isFinite(distKm) || distKm <= 0) {
    throw new Error("A distância deve ser maior que zero.");
  }
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    throw new Error("O tempo deve ser maior que zero.");
  }

  // Pace = tempo em segundos / distância em km
  const paceSeconds = timeSeconds / distKm;

  // Velocidade = distância em km / tempo em horas = distKm * 3600 / timeSeconds
  const speedKmh = (distKm * 3600) / timeSeconds;

  return {
    paceSeconds,
    paceFormatted: formatPace(paceSeconds),
    speedKmh,
  };
}

/**
 * Calcula a velocidade em km/h a partir do pace em segundos por km.
 * Velocidade = 3600 / pace
 * @param paceSeconds Segundos por km (> 0)
 * @example calcSpeedFromPace(400) -> 9
 */
export function calcSpeedFromPace(paceSeconds: SecondsPerKm): KmPerHour {
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    throw new Error("O pace deve ser maior que zero.");
  }
  return 3600 / paceSeconds;
}

/**
 * Calcula o pace em segundos por km a partir da velocidade em km/h.
 * Pace = 3600 / velocidade
 * @param speedKmh Velocidade em km/h (> 0)
 * @example calcPaceFromSpeed(9) -> 400
 */
export function calcPaceFromSpeed(speedKmh: KmPerHour): SecondsPerKm {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    throw new Error("A velocidade deve ser maior que zero.");
  }
  return 3600 / speedKmh;
}

/**
 * Calcula o tempo total necessário para percorrer uma distância com determinado pace.
 * @param distKm Distância em km (> 0)
 * @param paceSeconds Pace em segundos por km (> 0)
 * @returns Tempo em segundos
 */
export function calcTimeForDistance(
  distKm: Kilometers,
  paceSeconds: SecondsPerKm
): Seconds {
  if (!Number.isFinite(distKm) || distKm <= 0) {
    throw new Error("A distância deve ser maior que zero.");
  }
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    throw new Error("O pace deve ser maior que zero.");
  }
  return distKm * paceSeconds;
}

/**
 * Calcula a distância percorrida dado o tempo em segundos e velocidade em km/h.
 * Distância = velocidade * (tempo em segundos / 3600)
 * @param timeSeconds Tempo em segundos (> 0)
 * @param speedKmh Velocidade em km/h (> 0)
 * @returns Distância em km
 */
export function calcDistanceFromTimeAndSpeed(
  timeSeconds: Seconds,
  speedKmh: KmPerHour
): Kilometers {
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    throw new Error("O tempo deve ser maior que zero.");
  }
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    throw new Error("A velocidade deve ser maior que zero.");
  }
  return speedKmh * (timeSeconds / 3600);
}
