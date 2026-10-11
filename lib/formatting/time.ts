import { Seconds, SecondsPerKm } from "@/types";

/**
 * Converte segundos por quilômetro em string formatada "MM:SS".
 * Exemplo: 400 -> "6:40"
 */
export function formatPace(paceSeconds: SecondsPerKm): string {
  if (!Number.isFinite(paceSeconds) || paceSeconds < 0) {
    throw new Error("Pace em segundos inválido ou negativo");
  }

  const totalSeconds = Math.round(paceSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Converte string "MM:SS" (ou "M:SS") em segundos por km.
 * Exemplo: "6:40" -> 400, "8:30" -> 510
 */
export function parsePace(str: string): SecondsPerKm {
  if (!str || typeof str !== "string") {
    throw new Error("Pace deve ser uma string válida");
  }

  const trimmed = str.trim();
  const parts = trimmed.split(":");

  if (parts.length === 1) {
    const minutes = Number(parts[0]);
    if (isNaN(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
      throw new Error(`Pace inválido: "${str}". Informe minutos inteiros (ex: 6) ou no formato MM:SS (ex: 6:40)`);
    }
    return minutes * 60;
  }

  if (parts.length !== 2) {
    throw new Error(`Formato de pace inválido: "${str}". Use o formato MM:SS (ex: 6:40) ou apenas minutos (ex: 6)`);
  }

  const [minStr, secStr] = parts;
  const minutes = Number(minStr);
  const seconds = Number(secStr);

  if (
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60 ||
    isNaN(minutes) ||
    isNaN(seconds)
  ) {
    throw new Error(`Valores de tempo inválidos em "${str}". Segundos devem ser entre 00 e 59`);
  }

  return minutes * 60 + seconds;
}

/**
 * Converte segundos totais em string legível.
 * Se < 3600 segundos (menos de 1 hora): "MM:SS"
 * Se >= 3600 segundos: "H:MM:SS"
 * Exemplo: 1200 -> "20:00", 3661 -> "1:01:01"
 */
export function formatTime(seconds: Seconds, options?: { forceHours?: boolean }): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Tempo em segundos inválido ou negativo");
  }

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const remaining = total % 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  if (hours > 0 || options?.forceHours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Converte string "HH:MM:SS" ou "MM:SS" em segundos.
 * Exemplo: "20:00" -> 1200, "1:01:01" -> 3661, "20" -> 1200 (se minutos puros)
 */
export function parseTime(str: string): Seconds {
  if (!str || typeof str !== "string") {
    throw new Error("Tempo deve ser uma string válida");
  }

  const trimmed = str.trim();
  const parts = trimmed.split(":").map((p) => Number(p));

  if (parts.some((p) => isNaN(p) || p < 0 || !Number.isInteger(p))) {
    throw new Error(`Formato de tempo inválido: "${str}"`);
  }

  if (parts.length === 1) {
    // Número puro de minutos (ex: "20" minutos)
    return parts[0] * 60;
  }

  if (parts.length === 2) {
    // Formato MM:SS
    const [minutes, seconds] = parts;
    if (seconds >= 60) {
      throw new Error(`Segundos inválidos em "${str}". Devem ser menores que 60`);
    }
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    // Formato HH:MM:SS
    const [hours, minutes, seconds] = parts;
    if (minutes >= 60 || seconds >= 60) {
      throw new Error(`Minutos e segundos inválidos em "${str}". Devem ser menores que 60`);
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  throw new Error(`Formato de tempo não reconhecido: "${str}"`);
}

/**
 * Formata um número decimal com precisão especificada.
 * Exemplo: formatDecimal(9, 1) -> "9.0", formatDecimal(9.555, 2) -> "9.56"
 */
export function formatDecimal(val: number, places: number = 2): string {
  if (!Number.isFinite(val)) return "0";
  const factor = Math.pow(10, places);
  const rounded = Math.round((val + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(places);
}
