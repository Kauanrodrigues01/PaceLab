import { ValidationResult } from "@/types";

/**
 * Valida se uma distância é um número positivo e razoável.
 */
export function validateDistance(distKm: number): ValidationResult {
  if (typeof distKm !== "number" || isNaN(distKm)) {
    return { valid: false, message: "A distância deve ser um número válido." };
  }
  if (!Number.isFinite(distKm)) {
    return { valid: false, message: "A distância deve ser um valor finito." };
  }
  if (distKm <= 0) {
    return { valid: false, message: "A distância deve ser maior que zero." };
  }
  if (distKm > 1000) {
    return { valid: false, message: "A distância informada excede o limite razoável (máx. 1000 km)." };
  }
  return { valid: true };
}

/**
 * Valida se um tempo em segundos é um número positivo e finito.
 */
export function validateTime(seconds: number): ValidationResult {
  if (typeof seconds !== "number" || isNaN(seconds)) {
    return { valid: false, message: "O tempo deve ser um número válido." };
  }
  if (!Number.isFinite(seconds)) {
    return { valid: false, message: "O tempo deve ser um valor finito." };
  }
  if (seconds <= 0) {
    return { valid: false, message: "O tempo deve ser maior que zero." };
  }
  if (seconds > 86400 * 7) {
    return { valid: false, message: "O tempo excede o limite razoável (máx. 7 dias)." };
  }
  return { valid: true };
}

/**
 * Valida se uma velocidade em km/h é razoável e positiva.
 */
export function validateSpeed(speedKmh: number): ValidationResult {
  if (typeof speedKmh !== "number" || isNaN(speedKmh)) {
    return { valid: false, message: "A velocidade deve ser um número válido." };
  }
  if (!Number.isFinite(speedKmh)) {
    return { valid: false, message: "A velocidade deve ser um valor finito." };
  }
  if (speedKmh <= 0) {
    return { valid: false, message: "A velocidade deve ser maior que zero." };
  }
  if (speedKmh > 100) {
    return { valid: false, message: "A velocidade informada excede o limite biológico para corrida (máx. 100 km/h)." };
  }
  return { valid: true };
}

/**
 * Valida se a string representa um pace no formato MM:SS válido.
 */
export function validatePaceString(paceStr: string): ValidationResult {
  if (!paceStr || typeof paceStr !== "string") {
    return { valid: false, message: "Informe um pace válido (ex: 6 ou 6:40)." };
  }

  const trimmed = paceStr.trim();

  // Permite números inteiros de minutos puros (ex: "6" para 6:00)
  if (/^\d{1,3}$/.test(trimmed)) {
    const min = Number(trimmed);
    if (min <= 0) return { valid: false, message: "O pace deve ser maior que zero." };
    if (min > 60) return { valid: false, message: "O pace excede o limite razoável (máx. 60 min/km)." };
    return { valid: true };
  }

  const match = trimmed.match(/^(\d{1,3}):([0-5]\d)$/);

  if (!match) {
    return {
      valid: false,
      message: "Formato de pace inválido. Use minutos inteiros (ex: 6) ou MM:SS (ex: 6:40).",
    };
  }

  const minutes = Number(match[1]);
  if (minutes === 0 && Number(match[2]) === 0) {
    return { valid: false, message: "O pace não pode ser 0:00." };
  }

  return { valid: true };
}

/**
 * Valida se uma string de tempo está nos formatos MM:SS, HH:MM:SS ou minutos puros.
 */
export function validateTimeString(timeStr: string): ValidationResult {
  if (!timeStr || typeof timeStr !== "string") {
    return { valid: false, message: "Informe um tempo válido (ex: 20:00 ou 1:00:00)." };
  }

  const trimmed = timeStr.trim();

  // Formato puro de minutos (ex: "20")
  if (/^\d{1,4}$/.test(trimmed)) {
    const min = Number(trimmed);
    if (min <= 0) return { valid: false, message: "O tempo deve ser maior que zero." };
    return { valid: true };
  }

  // Formato MM:SS
  if (/^\d{1,3}:[0-5]\d$/.test(trimmed)) {
    const [m, s] = trimmed.split(":").map(Number);
    if (m === 0 && s === 0) return { valid: false, message: "O tempo não pode ser 0:00." };
    return { valid: true };
  }

  // Formato HH:MM:SS
  if (/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(trimmed)) {
    const [h, m, s] = trimmed.split(":").map(Number);
    if (h === 0 && m === 0 && s === 0) return { valid: false, message: "O tempo não pode ser 0:00:00." };
    return { valid: true };
  }

  return {
    valid: false,
    message: "Formato de tempo inválido. Use MM:SS, HH:MM:SS ou apenas os minutos (ex: 20:00).",
  };
}
