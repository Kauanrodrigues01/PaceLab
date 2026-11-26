import { formatPace, parseTime } from "@/lib/formatting/time";
import { WeeklyPlanStatus } from "@/lib/googleSheets/types";
import { calculateAge } from "@/lib/math/cooper";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import {
  ACTIVITY_ALIAS_MAP,
  getFortalezaWeekdayLabel,
  isRestPlanActivity,
  normalizeActivityLookupKey,
  normalizePlanActivityType,
  normalizeWeeklyPlanStatus,
  toFortalezaDateKey,
} from "@/lib/math/weeklyAdherence";
import {
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  ActivitySource,
  ActivityType,
  LOCATION_LABELS,
  LOCATION_TYPES,
  LocationType,
} from "@/types";

export const SHEET_TABS = {
  LOG_TREINOS: "Log_Treinos",
  SIMULADOS_TAF: "Simulados_TAF",
  PERFIL_E_METAS: "Perfil_e_Metas",
  PLANO_SEMANAL: "Plano_Semanal",
} as const;

export const SHEET_RANGES = {
  LOG_TREINOS_DATA: `${SHEET_TABS.LOG_TREINOS}!A:O`,
  LOG_TREINOS_ALL: `${SHEET_TABS.LOG_TREINOS}!A1:O`,
  LOG_TREINOS_IDS: `${SHEET_TABS.LOG_TREINOS}!A2:A`,
  SIMULADOS_TAF_DATA: `${SHEET_TABS.SIMULADOS_TAF}!A:J`,
  SIMULADOS_TAF_ALL: `${SHEET_TABS.SIMULADOS_TAF}!A1:J`,
  SIMULADOS_TAF_IDS: `${SHEET_TABS.SIMULADOS_TAF}!A2:A`,
  PERFIL_E_METAS_ALL: `${SHEET_TABS.PERFIL_E_METAS}!A1:I2`,
  PERFIL_E_METAS_ROW: `${SHEET_TABS.PERFIL_E_METAS}!A2:I2`,
  PLANO_SEMANAL_ALL: `${SHEET_TABS.PLANO_SEMANAL}!A1:I`,
  PLANO_SEMANAL_DATA: `${SHEET_TABS.PLANO_SEMANAL}!A2:I`,
  PLANO_SEMANAL_IDS: `${SHEET_TABS.PLANO_SEMANAL}!A2:A`,
} as const;

export const SHEET_HEADERS = {
  LOG_TREINOS: [
    "ID",
    "Data",
    "Origem",
    "Tipo",
    "Distância (km)",
    "Tempo Mov.",
    "Pace Médio (min/km)",
    "FC Média",
    "FC Máx",
    "Elevação (m)",
    "Cadência",
    "RPE (1-10)",
    "Peso (kg)",
    "Tênis",
    "Observações",
  ],
  SIMULADOS_TAF: [
    "ID",
    "Data",
    "Local",
    "Tempo Alvo (s)",
    "Tempo Real (s)",
    "Distância (m)",
    "Pace (min/km)",
    "Vel. (km/h)",
    "Status Meta",
    "Observações",
  ],
  PERFIL_E_METAS: [
    "Nome",
    "Idade",
    "Altura (cm)",
    "Peso Atual (kg)",
    "Edital Alvo",
    "Distância Mínima (m)",
    "Distância Alvo (m)",
    "Tempo Prova (min)",
    "Data Prova",
  ],
  PLANO_SEMANAL: [
    "ID",
    "Data",
    "Dia da Semana",
    "Tipo",
    "Distância Alvo (km)",
    "Pace Alvo (min/km)",
    "Descrição / Observação",
    "Status",
    "ID Treino Realizado",
  ],
} as const;

export type TafStatusMeta =
  | "Meta Segurança Atingida"
  | "Aprovado (Mínimo)"
  | "Abaixo do Mínimo";

export interface SheetTrainingSessionInput {
  id: string;
  sessionDate: Date | string;
  source?: ActivitySource | null;
  activityType: ActivityType;
  distanceKm: number;
  durationSeconds: number;
  speedKmh?: number;
  paceSeconds?: number;
  paceFormatted: string;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  elevationGainM?: number | null;
  avgCadence?: number | null;
  perceivedEffort?: number | null;
  bodyWeightKg?: number | null;
  activeCalories?: number | null;
  shoeName?: string | null;
  notes?: string | null;
  syncedToSheetsAt?: Date | null;
  updatedAt?: Date;
}

export interface SheetTafAttemptInput {
  id: string;
  source?: ActivitySource | null;
  testDate: Date | string;
  locationType?: LocationType | null;
  targetDurationSeconds: number;
  actualDurationSeconds: number;
  distanceMeters: number;
  paceFormatted: string;
  speedKmh: number;
  notes?: string | null;
  syncedToSheetsAt?: Date | null;
  updatedAt?: Date;
}

export interface SheetTafGoalInput {
  institutionName?: string | null;
  minDistanceMeters: number;
  targetDistanceMeters: number;
  targetDurationMinutes: number;
  targetExamDate?: Date | string | null;
}

export interface SheetProfileInput {
  name?: string | null;
  birthDate?: Date | string | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
  updatedAt?: Date | string | null;
}

export interface SheetWeightRecordInput {
  weightKg: number;
  recordedAt?: Date | string | null;
}

export interface ParsedTrainingSheetRow {
  rowNumber: number;
  id: string | null;
  sessionDate: Date;
  source: ActivitySource;
  activityType: ActivityType;
  distanceKm: number;
  durationSeconds: number;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  elevationGainM: number | null;
  avgCadence: number | null;
  perceivedEffort: number | null;
  bodyWeightKg: number | null;
  shoeName: string | null;
  notes: string | null;
}

export interface ParsedTafAttemptSheetRow {
  rowNumber: number;
  id: string | null;
  testDate: Date;
  locationType: LocationType | null;
  targetDurationSeconds: number;
  actualDurationSeconds: number;
  distanceMeters: number;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
  notes: string | null;
}

export type ParsedRowResult<T> =
  | { valid: true; data: T; warnings: string[] }
  | { valid: false; warning: string };

export interface ParsedWeeklyPlanSheetRow {
  rowNumber: number;
  planExternalId: string;
  plannedDate: Date;
  dayOfWeek: string;
  activityType: string;
  targetDistanceKm: number | null;
  targetPaceFormatted: string | null;
  description: string | null;
  status: WeeklyPlanStatus;
  matchedSessionId: string | null;
}

export type ParsedWeeklyPlanRowResult =
  | { valid: true; kind: "item"; data: ParsedWeeklyPlanSheetRow; warnings: string[] }
  | { valid: true; kind: "rest"; planExternalId: string | null; rawActivityType: string }
  | { valid: false; warning: string };

const FORMULA_TRIGGER_REGEX = /^[=+\-@\t\r]/;
const VALID_SOURCES_SET = new Set<string>(ACTIVITY_SOURCES);
const VALID_ACTIVITIES_SET = new Set<string>(ACTIVITY_TYPES);

const LOCATION_ALIAS_MAP: Record<string, LocationType> = {
  ...Object.fromEntries(
    LOCATION_TYPES.map((loc) => [
      normalizeActivityLookupKey(loc),
      loc,
    ])
  ),
  ...Object.fromEntries(
    Object.entries(LOCATION_LABELS).map(([loc, label]) => [
      normalizeActivityLookupKey(label),
      loc as LocationType,
    ])
  ),
  pista: "pista_400m",
  pista_400: "pista_400m",
  rua: "rua_plana",
  asfalto: "rua_plana",
  parque: "parque_praca",
  praca: "parque_praca",
  outro: "outro",
};

function stripLeadingApostrophe(raw: string): string {
  return raw.startsWith("'") ? raw.slice(1) : raw;
}

function buildMiddayUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function isUtcMidnightDate(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * Formata uma data no fuso `America/Fortaleza` (`YYYY-MM-DD`).
 */
export function formatDateFortaleza(dateInput: Date | string | null | undefined): string {
  return toFortalezaDateKey(dateInput);
}

function formatCalendarDateForSheet(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return "";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return "";
  if (isUtcMidnightDate(parsed)) {
    return parsed.toISOString().slice(0, 10);
  }
  return formatDateFortaleza(parsed);
}

/**
 * Formata segundos inteiros em `HH:MM:SS` com dois dígitos na hora (ex.: `00:34:12`).
 */
export function formatDurationHHMMSS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00:00";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const remaining = total % 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ].join(":");
}

/**
 * Prefixa pace com apóstrofo (`'5:13`) para impedir conversão automática em horário no modo `USER_ENTERED`.
 */
export function formatSheetPace(paceFormatted: string | null | undefined): string {
  if (!paceFormatted) return "";
  const trimmed = paceFormatted.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("'") ? trimmed : `'${trimmed}`;
}

/**
 * Sanitiza texto livre para planilha: colapsa quebras de linha em `" | "` e previne Formula Injection.
 */
export function sanitizeSheetText(
  text: string | null | undefined,
  maxLength?: number
): string {
  if (text === null || text === undefined) return "";
  let cleaned = String(text).replace(/\r\n|\r|\n/g, " | ").trim();
  if (!cleaned) return "";

  if (typeof maxLength === "number" && maxLength > 0 && cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }

  return FORMULA_TRIGGER_REGEX.test(cleaned) ? `'${cleaned}` : cleaned;
}

function unsanitizeSheetText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  let str = String(value).replace(/\r\n|\r|\n/g, " | ").trim();
  if (!str) return null;

  if (str.startsWith("'") && str.length > 1 && FORMULA_TRIGGER_REGEX.test(str.slice(1))) {
    str = str.slice(1).trim();
  }

  if (!str) return null;
  return str.length > maxLength ? str.slice(0, maxLength).trim() : str;
}

/**
 * Avalia o status de aprovação de um simulado TAF contra a meta ativa.
 */
export function computeTafStatusMeta(
  distanceMeters: number,
  goal?: Pick<SheetTafGoalInput, "minDistanceMeters" | "targetDistanceMeters"> | null
): TafStatusMeta {
  const effectiveMin = goal?.minDistanceMeters ?? 2400;
  const effectiveTarget = Math.max(effectiveMin, goal?.targetDistanceMeters ?? 2600);

  if (distanceMeters >= effectiveTarget) {
    return "Meta Segurança Atingida";
  }
  if (distanceMeters >= effectiveMin) {
    return "Aprovado (Mínimo)";
  }
  return "Abaixo do Mínimo";
}

/**
 * Converte `TrainingSession` para array posicional `Log_Treinos!A:O` (15 colunas).
 */
export function mapTrainingSessionToRow(
  session: SheetTrainingSessionInput
): (string | number)[] {
  return [
    session.id,
    formatDateFortaleza(session.sessionDate),
    session.source ?? "manual",
    session.activityType,
    Number(Number(session.distanceKm).toFixed(2)),
    formatDurationHHMMSS(session.durationSeconds),
    formatSheetPace(session.paceFormatted),
    session.avgHeartRate ?? "",
    session.maxHeartRate ?? "",
    session.elevationGainM != null ? Math.round(session.elevationGainM) : "",
    session.avgCadence ?? "",
    session.perceivedEffort ?? "",
    session.bodyWeightKg ?? "",
    sanitizeSheetText(session.shoeName, 100),
    sanitizeSheetText(session.notes, 1000),
  ];
}

/**
 * Converte `TafAttempt` para array posicional `Simulados_TAF!A:J` (10 colunas).
 */
export function mapTafAttemptToRow(
  attempt: SheetTafAttemptInput,
  goal?: Pick<SheetTafGoalInput, "minDistanceMeters" | "targetDistanceMeters"> | null
): (string | number)[] {
  return [
    attempt.id,
    formatDateFortaleza(attempt.testDate),
    attempt.locationType ?? "",
    attempt.targetDurationSeconds,
    attempt.actualDurationSeconds,
    attempt.distanceMeters,
    formatSheetPace(attempt.paceFormatted),
    Number(Number(attempt.speedKmh).toFixed(2)),
    computeTafStatusMeta(attempt.distanceMeters, goal),
    sanitizeSheetText(attempt.notes, 1000),
  ];
}

function resolveBirthDateIso(birthDate: Date | string | null | undefined): string | null {
  const calendarDate = formatCalendarDateForSheet(birthDate);
  return calendarDate ? `${calendarDate}T12:00:00.000Z` : null;
}

function resolveCurrentWeightKg(
  profile?: SheetProfileInput | null,
  latestWeight?: SheetWeightRecordInput | null
): number | "" {
  const profileWeight =
    typeof profile?.currentWeightKg === "number" && Number.isFinite(profile.currentWeightKg)
      ? Number(profile.currentWeightKg.toFixed(2))
      : null;
  const recordWeight =
    typeof latestWeight?.weightKg === "number" && Number.isFinite(latestWeight.weightKg)
      ? Number(latestWeight.weightKg.toFixed(2))
      : null;

  if (recordWeight === null) return profileWeight ?? "";
  if (profileWeight === null) return recordWeight;

  const recordMs = latestWeight?.recordedAt ? new Date(latestWeight.recordedAt).getTime() : NaN;
  const profileMs = profile?.updatedAt ? new Date(profile.updatedAt).getTime() : NaN;

  if (Number.isFinite(recordMs) && Number.isFinite(profileMs)) {
    return recordMs >= profileMs ? recordWeight : profileWeight;
  }

  return recordWeight;
}

/**
 * Converte perfil de atleta, pesagem mais recente e meta do edital para `Perfil_e_Metas!A2:I2` (9 colunas).
 */
export function mapProfileAndGoalToRow(
  profile?: SheetProfileInput | null,
  goal?: SheetTafGoalInput | null,
  latestWeight?: SheetWeightRecordInput | null
): (string | number)[] {
  const age = calculateAge(resolveBirthDateIso(profile?.birthDate));

  return [
    sanitizeSheetText(profile?.name, 100),
    age ?? "",
    profile?.heightCm ?? "",
    resolveCurrentWeightKg(profile, latestWeight),
    sanitizeSheetText(goal?.institutionName ?? "Edital Padrão", 120),
    goal?.minDistanceMeters ?? 2400,
    goal?.targetDistanceMeters ?? 2600,
    goal?.targetDurationMinutes ?? 12,
    formatCalendarDateForSheet(goal?.targetExamDate),
  ];
}

/**
 * Retorna `true` quando todas as células da linha são nulas, indefinidas ou espaços em branco.
 */
export function isBlankSheetRow(row: unknown[] | null | undefined): boolean {
  if (!row || row.length === 0) return true;
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

/**
 * Faz parse estrito de datas vindas da planilha (`YYYY-MM-DD` ou `DD/MM/YYYY`) para meio-dia UTC.
 */
export function parseSheetDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const formatted = formatDateFortaleza(value);
    return formatted ? parseSheetDate(formatted) : null;
  }

  if (typeof value !== "string") return null;
  const cleaned = stripLeadingApostrophe(value.trim());
  if (!cleaned) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
  if (isoMatch) {
    return buildMiddayUtcDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (brMatch) {
    return buildMiddayUtcDate(
      Number(brMatch[3]),
      Number(brMatch[2]),
      Number(brMatch[1])
    );
  }

  return null;
}

/**
 * Faz parse tolerante de números decimais/inteiros (pt-BR, en-US e unidades como `km`, `kg`, `m`).
 */
export function parseSheetNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = stripLeadingApostrophe(value.trim())
    .replace(/\s*(?:km\/h|km|kg|bpm|spm|seg|s|m)\s*$/i, "")
    .replace(/\s+/g, "");

  if (!trimmed) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = trimmed.replace(",", ".");
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Faz parse de durações em `HH:MM:SS`, `MM:SS` ou segundos puros positivos.
 */
export function parseSheetDurationSeconds(value: unknown): number | null {
  if (typeof value === "number") {
    const rounded = Math.round(value);
    return Number.isFinite(value) && rounded > 0 ? rounded : null;
  }

  if (typeof value !== "string") return null;
  const cleaned = stripLeadingApostrophe(value.trim());
  if (!cleaned) return null;

  if (cleaned.includes(":")) {
    try {
      const parsed = parseTime(cleaned);
      return parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  const numericSeconds = parseSheetNumber(cleaned);
  if (numericSeconds === null) return null;
  const rounded = Math.round(numericSeconds);
  return rounded > 0 ? rounded : null;
}

/**
 * Normaliza pace formatado vindo da planilha (`'5:13`, `05:13` ou conversão `05:13:00`).
 */
export function parseSheetPaceFormatted(
  value: unknown,
  distanceKm?: number,
  durationSeconds?: number
): string | null {
  if (typeof value === "string") {
    const cleaned = stripLeadingApostrophe(value.trim());
    const twoPart = /^(\d{1,2}):(\d{2})$/.exec(cleaned);
    if (twoPart) {
      const min = Number(twoPart[1]);
      const sec = Number(twoPart[2]);
      if (min >= 0 && sec >= 0 && sec < 60) {
        return `${min}:${String(sec).padStart(2, "0")}`;
      }
    }

    const accidentalHours = /^(\d{1,2}):(\d{2}):00$/.exec(cleaned);
    if (accidentalHours) {
      const min = Number(accidentalHours[1]);
      const sec = Number(accidentalHours[2]);
      if (min >= 2 && min <= 30 && sec < 60) {
        return `${min}:${String(sec).padStart(2, "0")}`;
      }
    }
  }

  if (
    typeof distanceKm === "number" &&
    distanceKm > 0 &&
    typeof durationSeconds === "number" &&
    durationSeconds > 0
  ) {
    const { paceSeconds } = calcPaceFromDistanceAndTime(distanceKm, durationSeconds);
    return formatPace(Math.round(paceSeconds));
  }

  return null;
}

/**
 * Normaliza o tipo de atividade da coluna `Tipo` (`Log_Treinos!D`) para o enum real `ActivityType`.
 */
export function normalizeSheetActivityType(value: unknown): {
  activityType: ActivityType;
  matched: boolean;
  raw: string;
} {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return { activityType: "corrida_continua", matched: false, raw };
  }

  if (VALID_ACTIVITIES_SET.has(raw)) {
    return { activityType: raw as ActivityType, matched: true, raw };
  }

  const key = normalizeActivityLookupKey(raw);
  const mapped = ACTIVITY_ALIAS_MAP[key];
  if (mapped) {
    return { activityType: mapped, matched: true, raw };
  }

  return { activityType: "corrida_continua", matched: false, raw };
}

/**
 * Normaliza `Pace Alvo (min/km)` vindo da aba `Plano_Semanal!F`.
 * Remove apóstrofo inicial e sufixos (`/km`, `min/km`), corrige `:00` via `parseSheetPaceFormatted`
 * e preserva faixas como `"5:45-6:00"` ou `"5:45–6:00"`.
 */
export function parseWeeklyPlanTargetPace(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = stripLeadingApostrophe(value.trim())
    .trim()
    .replace(/\s*(?:min\s*\/\s*km|\/\s*km)/gi, "")
    .trim();

  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (lower === "-" || lower === "--" || lower === "—" || lower === "n/a" || lower === "na") {
    return null;
  }

  const single = parseSheetPaceFormatted(cleaned);
  if (single) {
    return single;
  }

  const rangeMatch =
    /^(\d{1,2}:\d{2}(?::00)?)\s*([-–—]|a|até)\s*(\d{1,2}:\d{2}(?::00)?)$/i.exec(cleaned);
  if (rangeMatch) {
    const start = parseSheetPaceFormatted(rangeMatch[1]);
    const end = parseSheetPaceFormatted(rangeMatch[3]);
    if (!start || !end) {
      return null;
    }
    const rawSep = rangeMatch[2].toLowerCase();
    const sep = rawSep === "-" ? "-" : "–";
    return `${start}${sep}${end}`;
  }

  return null;
}

/**
 * Normaliza a coluna `Origem` para `ActivitySource` (fallback padrão `"sheets"`).
 */
export function normalizeSheetActivitySource(
  value: unknown,
  fallback: ActivitySource = "sheets"
): ActivitySource {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return VALID_SOURCES_SET.has(normalized) ? (normalized as ActivitySource) : fallback;
}

/**
 * Normaliza a coluna `Local` (`Simulados_TAF!C`) para `LocationType | null`.
 */
export function normalizeSheetLocationType(value: unknown): LocationType | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return LOCATION_ALIAS_MAP[normalizeActivityLookupKey(trimmed)] ?? null;
}

function parseBoundedMetric(
  value: unknown,
  min: number,
  max: number,
  options?: { integer?: boolean }
): number | null {
  const num = parseSheetNumber(value);
  if (num === null) return null;
  const normalized = options?.integer ? Math.round(num) : num;
  if (normalized < min || normalized > max) return null;
  return normalized;
}

function normalizeIdCell(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null;
  const id = String(cell).trim();
  return id.length > 0 ? id : null;
}

/**
 * Faz o parse e validação contratual de uma linha da aba `Log_Treinos!A:O`.
 */
export function parseTrainingRowFromSheet(
  row: unknown[],
  rowNumber: number
): ParsedRowResult<ParsedTrainingSheetRow> {
  const sessionDate = parseSheetDate(row[1]);
  if (!sessionDate) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Log_Treinos): Data inválida ou ausente.`,
    };
  }

  const distanceKm = parseSheetNumber(row[4]);
  if (distanceKm === null || distanceKm < 0.05 || distanceKm > 100) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Log_Treinos): Distância (km) inválida (${String(row[4] ?? "")}).`,
    };
  }

  const durationSeconds = parseSheetDurationSeconds(row[5]);
  if (durationSeconds === null || durationSeconds < 30 || durationSeconds > 86400) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Log_Treinos): Tempo Mov. inválido (${String(row[5] ?? "")}).`,
    };
  }

  const warnings: string[] = [];
  const activityResult = normalizeSheetActivityType(row[3]);
  if (activityResult.raw && !activityResult.matched) {
    warnings.push(
      `Linha ${rowNumber} (Log_Treinos): Tipo "${activityResult.raw}" normalizado para "corrida_continua".`
    );
  }

  const avgHeartRate = parseBoundedMetric(row[7], 30, 250, { integer: true });
  let maxHeartRate = parseBoundedMetric(row[8], 30, 250, { integer: true });
  if (avgHeartRate !== null && maxHeartRate !== null && maxHeartRate < avgHeartRate) {
    warnings.push(
      `Linha ${rowNumber} (Log_Treinos): FC Máx ajustada para coincidir com FC Média (${avgHeartRate}).`
    );
    maxHeartRate = avgHeartRate;
  }

  const elevationRaw = parseBoundedMetric(row[9], 0, 10000);
  const elevationGainM = elevationRaw !== null ? Math.round(elevationRaw) : null;
  const avgCadence = parseBoundedMetric(row[10], 30, 300, { integer: true });
  const perceivedEffort = parseBoundedMetric(row[11], 1, 10, { integer: true });
  const bodyWeightRaw = parseBoundedMetric(row[12], 30, 250);
  const bodyWeightKg = bodyWeightRaw !== null ? Number(bodyWeightRaw.toFixed(2)) : null;

  const paceCalc = calcPaceFromDistanceAndTime(distanceKm, durationSeconds);
  const paceSeconds = Math.round(paceCalc.paceSeconds);
  const speedKmh = Number(paceCalc.speedKmh.toFixed(2));
  const paceFormatted = formatPace(paceSeconds);

  return {
    valid: true,
    warnings,
    data: {
      rowNumber,
      id: normalizeIdCell(row[0]),
      sessionDate,
      source: normalizeSheetActivitySource(row[2], "sheets"),
      activityType: activityResult.activityType,
      distanceKm: Number(distanceKm.toFixed(3)),
      durationSeconds,
      speedKmh,
      paceSeconds,
      paceFormatted,
      avgHeartRate,
      maxHeartRate,
      elevationGainM,
      avgCadence,
      perceivedEffort,
      bodyWeightKg,
      shoeName: unsanitizeSheetText(row[13], 100),
      notes: unsanitizeSheetText(row[14], 1000),
    },
  };
}

/**
 * Faz o parse e validação contratual de uma linha da aba `Simulados_TAF!A:J`.
 */
export function parseTafAttemptRowFromSheet(
  row: unknown[],
  rowNumber: number
): ParsedRowResult<ParsedTafAttemptSheetRow> {
  const testDate = parseSheetDate(row[1]);
  if (!testDate) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Simulados_TAF): Data inválida ou ausente.`,
    };
  }

  const actualDurationSeconds = parseSheetDurationSeconds(row[4]);
  if (
    actualDurationSeconds === null ||
    actualDurationSeconds < 30 ||
    actualDurationSeconds > 7200
  ) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Simulados_TAF): Tempo Real (s) inválido (${String(row[4] ?? "")}).`,
    };
  }

  const distanceRaw = parseSheetNumber(row[5]);
  const distanceMeters = distanceRaw !== null ? Math.round(distanceRaw) : null;
  if (distanceMeters === null || distanceMeters < 100 || distanceMeters > 10000) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Simulados_TAF): Distância (m) inválida (${String(row[5] ?? "")}).`,
    };
  }

  const targetParsed = parseSheetDurationSeconds(row[3]);
  const targetDurationSeconds =
    targetParsed !== null && targetParsed >= 30 && targetParsed <= 7200
      ? targetParsed
      : 720;

  const paceCalc = calcPaceFromDistanceAndTime(distanceMeters / 1000, actualDurationSeconds);
  const paceSeconds = Math.round(paceCalc.paceSeconds);
  const speedKmh = Number(paceCalc.speedKmh.toFixed(2));
  const paceFormatted = formatPace(paceSeconds);

  return {
    valid: true,
    warnings: [],
    data: {
      rowNumber,
      id: normalizeIdCell(row[0]),
      testDate,
      locationType: normalizeSheetLocationType(row[2]),
      targetDurationSeconds,
      actualDurationSeconds,
      distanceMeters,
      speedKmh,
      paceSeconds,
      paceFormatted,
      notes: unsanitizeSheetText(row[9], 1000),
    },
  };
}

function isProtectedTelemetrySource(source?: ActivitySource | null): boolean {
  return source === "fit_upload" || source === "gpx_upload";
}

function roundNullableFloat(val: number | null | undefined, digits: number): number | null {
  return typeof val === "number" && Number.isFinite(val) ? Number(val.toFixed(digits)) : null;
}

/**
 * Compara um registro de `TrainingSession` do banco com a linha vinda do Sheets.
 * Garante idempotência contra arredondamentos, fuso horário e proteção de telemetria `.FIT`/`.GPX`.
 */
export function hasTrainingRowDivergence(
  dbSession: SheetTrainingSessionInput,
  parsedRow: ParsedTrainingSheetRow
): boolean {
  if (dbSession.activityType !== parsedRow.activityType) return true;
  if ((dbSession.perceivedEffort ?? null) !== (parsedRow.perceivedEffort ?? null)) return true;
  if (roundNullableFloat(dbSession.bodyWeightKg, 2) !== roundNullableFloat(parsedRow.bodyWeightKg, 2)) {
    return true;
  }
  if (sanitizeSheetText(dbSession.shoeName, 100) !== sanitizeSheetText(parsedRow.shoeName, 100)) {
    return true;
  }
  if (sanitizeSheetText(dbSession.notes, 1000) !== sanitizeSheetText(parsedRow.notes, 1000)) {
    return true;
  }

  if (isProtectedTelemetrySource(dbSession.source)) {
    return false;
  }

  if (formatDateFortaleza(dbSession.sessionDate) !== formatDateFortaleza(parsedRow.sessionDate)) {
    return true;
  }
  if (roundNullableFloat(dbSession.distanceKm, 2) !== roundNullableFloat(parsedRow.distanceKm, 2)) {
    return true;
  }
  if (dbSession.durationSeconds !== parsedRow.durationSeconds) return true;
  if ((dbSession.avgHeartRate ?? null) !== (parsedRow.avgHeartRate ?? null)) return true;
  if ((dbSession.maxHeartRate ?? null) !== (parsedRow.maxHeartRate ?? null)) return true;

  const dbElev = dbSession.elevationGainM != null ? Math.round(dbSession.elevationGainM) : null;
  const parsedElev =
    parsedRow.elevationGainM != null ? Math.round(parsedRow.elevationGainM) : null;
  if (dbElev !== parsedElev) return true;

  if ((dbSession.avgCadence ?? null) !== (parsedRow.avgCadence ?? null)) return true;

  return false;
}

/**
 * Compara um registro de `TafAttempt` do banco com a linha vinda da aba `Simulados_TAF`.
 */
export function hasTafAttemptRowDivergence(
  dbAttempt: SheetTafAttemptInput,
  parsedRow: ParsedTafAttemptSheetRow
): boolean {
  if ((dbAttempt.locationType ?? null) !== (parsedRow.locationType ?? null)) return true;
  if (sanitizeSheetText(dbAttempt.notes, 1000) !== sanitizeSheetText(parsedRow.notes, 1000)) {
    return true;
  }

  if (isProtectedTelemetrySource(dbAttempt.source)) {
    return false;
  }

  if (formatDateFortaleza(dbAttempt.testDate) !== formatDateFortaleza(parsedRow.testDate)) {
    return true;
  }
  if (dbAttempt.targetDurationSeconds !== parsedRow.targetDurationSeconds) return true;
  if (dbAttempt.actualDurationSeconds !== parsedRow.actualDurationSeconds) return true;
  if (dbAttempt.distanceMeters !== parsedRow.distanceMeters) return true;

  return false;
}

const PROFILE_GOAL_NUMERIC_COLUMNS = new Set([1, 2, 3, 5, 6, 7]);
const PROFILE_GOAL_DATE_COLUMN = 8;

/**
 * Compara a linha lida de `Perfil_e_Metas!A2:I2` com a linha esperada gerada do banco,
 * tolerando formatação pt-BR (vírgula decimal, datas DD/MM/YYYY) e células finais omitidas pela API.
 */
export function hasProfileGoalRowDivergence(
  existingRow: unknown[] | null | undefined,
  expectedRow: (string | number)[]
): boolean {
  if (!existingRow || isBlankSheetRow(existingRow)) {
    return true;
  }

  for (let col = 0; col < expectedRow.length; col += 1) {
    const expectedStr = String(expectedRow[col] ?? "").trim();
    const existingStr = String(existingRow[col] ?? "").trim();

    if (col === PROFILE_GOAL_DATE_COLUMN) {
      if (expectedStr === "" && existingStr === "") continue;
      if (expectedStr === "" || existingStr === "") return true;

      const expectedDate = parseSheetDate(expectedStr);
      const existingDate = parseSheetDate(existingStr);
      if (expectedDate && existingDate) {
        if (formatDateFortaleza(expectedDate) !== formatDateFortaleza(existingDate)) {
          return true;
        }
        continue;
      }

      if (expectedStr !== existingStr) return true;
      continue;
    }

    if (PROFILE_GOAL_NUMERIC_COLUMNS.has(col)) {
      if (expectedStr === "" && existingStr === "") continue;
      const expectedNum = parseSheetNumber(expectedRow[col]);
      const normalizedGroupedInt =
        expectedNum !== null &&
        Number.isInteger(expectedNum) &&
        expectedNum >= 1000 &&
        /^\d{1,3}(?:\.\d{3})+$/.test(existingStr)
          ? Number(existingStr.replace(/\./g, ""))
          : null;
      const existingNum = normalizedGroupedInt ?? parseSheetNumber(existingRow[col]);
      if (expectedNum !== null && existingNum !== null) {
        if (Math.abs(expectedNum - existingNum) >= 0.01) {
          return true;
        }
        continue;
      }
      if (expectedStr !== existingStr) return true;
      continue;
    }

    if (stripLeadingApostrophe(expectedStr) !== stripLeadingApostrophe(existingStr)) {
      return true;
    }
  }

  return false;
}

/**
 * Faz o parse e normalização de uma linha da aba `Plano_Semanal!A2:I`.
 * Linhas de descanso (`Descanso`, `Off`, `Rest`, `Folga`) são sinalizadas com `kind: "rest"`
 * para serem ignoradas sem warnings espúrios nem contabilização como `"Perdido"`.
 */
export function parseWeeklyPlanRowFromSheet(
  row: unknown[],
  rowNumber: number
): ParsedWeeklyPlanRowResult {
  if (isRestPlanActivity(row[3])) {
    return {
      valid: true,
      kind: "rest",
      planExternalId: normalizeIdCell(row[0]),
      rawActivityType: String(row[3] ?? "").trim(),
    };
  }

  const planExternalId = normalizeIdCell(row[0]);
  if (!planExternalId) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Plano_Semanal): ID ausente.`,
    };
  }

  const plannedDate = parseSheetDate(row[1]);
  if (!plannedDate) {
    return {
      valid: false,
      warning: `Linha ${rowNumber} (Plano_Semanal): Data inválida ou ausente.`,
    };
  }

  const warnings: string[] = [];
  const dayOfWeek =
    unsanitizeSheetText(row[2], 30) ?? getFortalezaWeekdayLabel(plannedDate);

  const rawType = unsanitizeSheetText(row[3], 60);
  let activityType = "corrida_continua";
  if (!rawType) {
    warnings.push(
      `Linha ${rowNumber} (Plano_Semanal): Tipo ausente, assumido "corrida_continua".`
    );
  } else {
    const normalized = normalizePlanActivityType(rawType);
    if (normalized) {
      activityType = normalized;
    } else {
      activityType = rawType;
      warnings.push(
        `Linha ${rowNumber} (Plano_Semanal): Tipo "${rawType}" não corresponde a alias padrão de corrida/caminhada.`
      );
    }
  }

  const rawDistText =
    row[4] === null || row[4] === undefined
      ? ""
      : stripLeadingApostrophe(String(row[4]).trim()).trim();
  const rawDistLower = rawDistText.toLowerCase();
  const isNeutralDistPlaceholder =
    rawDistText === "" ||
    rawDistLower === "-" ||
    rawDistLower === "--" ||
    rawDistLower === "—" ||
    rawDistLower === "n/a" ||
    rawDistLower === "na" ||
    rawDistLower === "tempo";

  const parsedDist = parseSheetNumber(rawDistText);
  let targetDistanceKm: number | null = null;
  if (parsedDist !== null && parsedDist > 0) {
    targetDistanceKm = Number(parsedDist.toFixed(3));
  } else if (parsedDist !== null && parsedDist < 0) {
    warnings.push(
      `Linha ${rowNumber} (Plano_Semanal): Distância Alvo inválida (${rawDistText}), tratada como treino por tempo.`
    );
  } else if (parsedDist === null && !isNeutralDistPlaceholder) {
    warnings.push(
      `Linha ${rowNumber} (Plano_Semanal): Distância Alvo inválida (${rawDistText}), tratada como treino por tempo.`
    );
  }

  return {
    valid: true,
    kind: "item",
    warnings,
    data: {
      rowNumber,
      planExternalId,
      plannedDate,
      dayOfWeek,
      activityType,
      targetDistanceKm,
      targetPaceFormatted: parseWeeklyPlanTargetPace(row[5]),
      description: unsanitizeSheetText(row[6], 500),
      status: normalizeWeeklyPlanStatus(row[7]),
      matchedSessionId: normalizeIdCell(row[8]),
    },
  };
}
