export const FORTALEZA_TIMEZONE = "America/Fortaleza";

export type DateInputValue = string | Date | null | undefined;

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.\d+)?(?:Z|\+00:00)$/i;
const DATE_TIME_LOCAL_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const MS_PER_DAY = 86_400_000;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

function buildValidatedCalendarParts(
  year: number,
  month: number,
  day: number
): CalendarParts | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseDateOnlyParts(trimmed: string): CalendarParts | null {
  const match = DATE_ONLY_REGEX.exec(trimmed);
  if (!match) return null;
  return buildValidatedCalendarParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3])
  );
}

function formatCalendarPartsKey(parts: CalendarParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isUtcMidnightDate(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

function extractCalendarParts(
  value: DateInputValue,
  calendarDateMode: boolean
): CalendarParts | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    if (calendarDateMode && isUtcMidnightDate(value)) {
      return buildValidatedCalendarParts(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate()
      );
    }
    return null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (calendarDateMode) {
    const utcMidnightMatch = UTC_MIDNIGHT_REGEX.exec(trimmed);
    if (utcMidnightMatch) {
      return buildValidatedCalendarParts(
        Number(utcMidnightMatch[1]),
        Number(utcMidnightMatch[2]),
        Number(utcMidnightMatch[3])
      );
    }
  }

  return parseDateOnlyParts(trimmed);
}

function parseDateSafe(
  value: DateInputValue,
  calendarDateMode = false
): Date | null {
  if (value === null || value === undefined) return null;

  const calendarParts = extractCalendarParts(value, calendarDateMode);
  if (calendarParts) {
    return new Date(
      Date.UTC(calendarParts.year, calendarParts.month - 1, calendarParts.day, 15, 0, 0)
    );
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Datas civis puras ou meias-noites UTC malformadas (ex.: "2026-02-31") não devem sofrer rollover em Date()
  if (
    DATE_ONLY_REGEX.test(trimmed) ||
    (calendarDateMode && UTC_MIDNIGHT_REGEX.test(trimmed))
  ) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formata uma data completa (dd/mm/aaaa) no fuso oficial `America/Fortaleza`.
 * Entradas `YYYY-MM-DD` preservam o dia civil exatamente como informado.
 */
export function formatDateFortaleza(
  value: DateInputValue,
  fallback = "--/--/----"
): string {
  const parsed = parseDateSafe(value, false);
  if (!parsed) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FORTALEZA_TIMEZONE,
  }).format(parsed);
}

/**
 * Formata campos puramente de calendário civil (ex.: data de nascimento, data da prova do edital,
 * pesagem salva à meia-noite UTC), preservando o dia civil mesmo quando armazenados como
 * `T00:00:00.000Z` / `Date` UTC à meia-noite.
 */
export function formatCalendarDateFortaleza(
  value: DateInputValue,
  fallback = "--/--/----"
): string {
  const parsed = parseDateSafe(value, true);
  if (!parsed) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FORTALEZA_TIMEZONE,
  }).format(parsed);
}

/**
 * Formata data e hora no fuso `America/Fortaleza` (`dd/mm/aaaa, hh:mm` em 24h).
 * Quando a entrada for puramente civil (`YYYY-MM-DD`), omite horário fictício e exibe apenas a data.
 */
export function formatDateTimeFortaleza(
  value: DateInputValue,
  fallbackOrOptions:
    | string
    | {
        fallback?: string;
        includeWeekday?: boolean;
        shortMonth?: boolean;
      } = "--/--/----"
): string {
  const options =
    typeof fallbackOrOptions === "string"
      ? { fallback: fallbackOrOptions }
      : fallbackOrOptions;

  const fallback = options.fallback ?? "--/--/----";
  const parsed = parseDateSafe(value, false);
  if (!parsed) return fallback;

  const isDateOnlyInput =
    typeof value === "string" && parseDateOnlyParts(value.trim()) !== null;

  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: options.shortMonth ? "short" : "2-digit",
    year: "numeric",
    timeZone: FORTALEZA_TIMEZONE,
  };

  if (!isDateOnlyInput) {
    formatOptions.hour = "2-digit";
    formatOptions.minute = "2-digit";
    formatOptions.hourCycle = "h23";
  }

  if (options.includeWeekday) {
    formatOptions.weekday = "short";
  }

  return new Intl.DateTimeFormat("pt-BR", formatOptions).format(parsed);
}

/**
 * Formata uma data curta (`dd/mm` ou `dd de mês`) para gráficos e heatmaps em `America/Fortaleza`.
 */
export function formatShortDateFortaleza(
  value: DateInputValue,
  fallbackOrOptions:
    | string
    | {
        fallback?: string;
        monthStyle?: "2-digit" | "short";
      } = "--/--"
): string {
  const options =
    typeof fallbackOrOptions === "string"
      ? { fallback: fallbackOrOptions }
      : fallbackOrOptions;

  const fallback = options.fallback ?? "--/--";
  const parsed = parseDateSafe(value, false);
  if (!parsed) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: options.monthStyle ?? "2-digit",
    timeZone: FORTALEZA_TIMEZONE,
  }).format(parsed);
}

/**
 * Extrai a chave de calendário (`YYYY-MM-DD`) de um instante em `America/Fortaleza`.
 * Preserva entradas `YYYY-MM-DD` válidas sem sofrer deslocamento de fuso.
 */
export function toFortalezaDateKey(
  value: DateInputValue,
  calendarDateMode = false
): string | null {
  const calendarParts = extractCalendarParts(value, calendarDateMode);
  if (calendarParts) {
    return formatCalendarPartsKey(calendarParts);
  }

  const parsed = parseDateSafe(value, calendarDateMode);
  if (!parsed) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FORTALEZA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * Extrai a chave civil (`YYYY-MM-DD`) preservando registros legados salvos à meia-noite UTC.
 */
export function toFortalezaCalendarDateKey(value: DateInputValue): string | null {
  return toFortalezaDateKey(value, true);
}

/**
 * Retorna a data de hoje (`YYYY-MM-DD`) no fuso `America/Fortaleza`,
 * evitando deslocamento D+1 após 21h em hosts UTC.
 */
export function getTodayFortalezaDateKey(referenceNow: Date = new Date()): string {
  const key = toFortalezaDateKey(referenceNow, false);
  if (key) return key;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FORTALEZA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Soma ou subtrai dias civis sobre uma chave `YYYY-MM-DD` (ou instante em Fortaleza).
 */
export function shiftFortalezaDateKey(
  value: DateInputValue,
  deltaDays: number
): string | null {
  if (!Number.isFinite(deltaDays)) return null;
  const key = toFortalezaDateKey(value, false);
  if (!key) return null;
  const parts = parseDateOnlyParts(key);
  if (!parts) return null;

  const shiftedMs =
    Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0) +
    Math.trunc(deltaDays) * MS_PER_DAY;
  return toFortalezaDateKey(new Date(shiftedMs), false);
}

/**
 * Converte uma data civil (`YYYY-MM-DD`) para meio-dia em `America/Fortaleza` em formato ISO UTC
 * (`YYYY-MM-DDT15:00:00.000Z`), evitando regressão D-1 na renderização em Fortaleza.
 */
export function toFortalezaNoonIso(dateKeyOrIso: string): string {
  const trimmed = dateKeyOrIso.trim();
  const dateOnly = parseDateOnlyParts(trimmed);
  if (dateOnly) {
    return `${formatCalendarPartsKey(dateOnly)}T15:00:00.000Z`;
  }

  const parsed = parseDateSafe(trimmed, false);
  if (parsed) {
    return parsed.toISOString();
  }

  return new Date(`${getTodayFortalezaDateKey()}T15:00:00.000Z`).toISOString();
}

/**
 * Calcula a diferença exata em dias civis (`targetDate - referenceDate`) no calendário de Fortaleza.
 * Retorna `0` para hoje, `1` para amanhã, `-1` para ontem, etc.
 */
export function getDaysDifferenceFortaleza(
  targetDate: DateInputValue,
  referenceDate: DateInputValue = new Date()
): number | null {
  const targetKey = toFortalezaCalendarDateKey(targetDate);
  const todayKey = toFortalezaDateKey(referenceDate, false);
  if (!targetKey || !todayKey) return null;

  const targetParts = parseDateOnlyParts(targetKey);
  const todayParts = parseDateOnlyParts(todayKey);
  if (!targetParts || !todayParts) return null;

  const targetUtc = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const todayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

  return Math.round((targetUtc - todayUtc) / MS_PER_DAY);
}

/**
 * Calcula a idade em anos completos segundo o calendário oficial de `America/Fortaleza`,
 * preservando datas de nascimento armazenadas à meia-noite UTC.
 */
export function getAgeFromBirthDateFortaleza(
  birthDate: DateInputValue,
  referenceDate: DateInputValue = new Date()
): number | null {
  const birthKey = toFortalezaCalendarDateKey(birthDate);
  const todayKey = toFortalezaDateKey(referenceDate, false);
  if (!birthKey || !todayKey) return null;

  const birthParts = parseDateOnlyParts(birthKey);
  const todayParts = parseDateOnlyParts(todayKey);
  if (!birthParts || !todayParts) return null;

  let age = todayParts.year - birthParts.year;
  const monthDiff = todayParts.month - birthParts.month;
  if (monthDiff < 0 || (monthDiff === 0 && todayParts.day < birthParts.day)) {
    age--;
  }

  return age >= 0 && age <= 120 ? age : null;
}

/**
 * Formata um instante para `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) no fuso de Fortaleza.
 */
export function formatFortalezaDateTimeInput(
  value: DateInputValue = new Date()
): string {
  const parsed = parseDateSafe(value, false) ?? new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FORTALEZA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;

  if (!year || !month || !day || !hour || !minute) {
    return `${getTodayFortalezaDateKey()}T12:00`;
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Converte o valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) interpretado em
 * `America/Fortaleza` (`-03:00`) para timestamp ISO UTC.
 */
export function fromFortalezaDateTimeInput(localValue: string): string {
  const trimmed = localValue.trim();
  const match = DATE_TIME_LOCAL_REGEX.exec(trimmed);
  if (match) {
    const parsed = new Date(`${trimmed}:00-03:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const parsed = parseDateSafe(trimmed, false);
  return parsed ? parsed.toISOString() : new Date().toISOString();
}

export interface FortalezaWeekInfo {
  weekKey: string; // Segunda-feira YYYY-MM-DD
  weekLabel: string; // dd/mm da segunda-feira
  weekRangeLabel: string; // dd/mm a dd/mm (segunda a domingo)
  timestamp: number; // Início da segunda-feira em Fortaleza (00:00:00.000-03:00)
  weekStartIso: string;
  weekEndIso: string;
}

/**
 * Calcula informações da semana (Segunda a Domingo) em `America/Fortaleza`
 * para agregações e gráficos sem dependência do fuso local do host.
 */
export function getFortalezaWeekInfo(
  value: DateInputValue
): FortalezaWeekInfo | null {
  const dateKey = toFortalezaDateKey(value, false);
  if (!dateKey) return null;

  const parts = parseDateOnlyParts(dateKey);
  if (!parts) return null;

  const utcDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)
  ).getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;

  const mondayKey = shiftFortalezaDateKey(dateKey, diffToMonday);
  if (!mondayKey) return null;
  const sundayKey = shiftFortalezaDateKey(mondayKey, 6);
  if (!sundayKey) return null;

  const mondayStart = new Date(`${mondayKey}T00:00:00.000-03:00`);
  const sundayEnd = new Date(`${sundayKey}T23:59:59.999-03:00`);
  const startLabel = formatShortDateFortaleza(mondayKey, "--/--");
  const endLabel = formatShortDateFortaleza(sundayKey, "--/--");

  return {
    weekKey: mondayKey,
    weekLabel: startLabel,
    weekRangeLabel: `${startLabel} a ${endLabel}`,
    timestamp: mondayStart.getTime(),
    weekStartIso: mondayStart.toISOString(),
    weekEndIso: sundayEnd.toISOString(),
  };
}

/**
 * Extrai a chave mensal (`YYYY-MM`) no fuso `America/Fortaleza`.
 */
export function getFortalezaMonthKey(value: DateInputValue): string | null {
  const dateKey = toFortalezaDateKey(value, false);
  return dateKey ? dateKey.slice(0, 7) : null;
}

