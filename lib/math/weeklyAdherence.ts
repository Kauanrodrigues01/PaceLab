import { WeeklyPlanStatus } from "@/lib/googleSheets/types";
import { ACTIVITY_LABELS, ACTIVITY_TYPES, ActivityType } from "@/types";

const FORTALEZA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Fortaleza",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORTALEZA_WEEKDAY_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Fortaleza",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

const MS_PER_DAY = 86_400_000;
const RATIO_EPSILON = 1e-9;

export const WEEKLY_PACE_TOLERANCE_SECONDS = 15;
export const WEEKLY_VOLUME_OVER_RATIO = 1.25;

const MIN_VALID_PACE_SECONDS = 120; // 2:00/km
const MAX_VALID_PACE_SECONDS = 1500; // 25:00/km

const HIGH_INTENSITY_ACTIVITIES = new Set<ActivityType>([
  "corrida_intervalada",
  "tempo_run",
]);

const LOW_INTENSITY_ACTIVITIES = new Set<ActivityType>([
  "rodagem_leve",
  "caminhada",
]);

export type WeeklyAdaptationReasonCode =
  | "volume_above"
  | "pace_faster"
  | "pace_slower"
  | "type_changed";

export const WEEKLY_ADAPTATION_REASON_LABELS: Record<
  WeeklyAdaptationReasonCode,
  string
> = {
  volume_above: "Volume acima do planejado",
  pace_faster: "Ritmo mais forte que o alvo",
  pace_slower: "Ritmo mais lento que o alvo",
  type_changed: "Tipo alterado",
};

const WEEKDAY_LABELS_PT_BR = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

const REST_ACTIVITY_KEYS = new Set([
  "descanso",
  "rest",
  "off",
  "folga",
  "repouso",
  "day_off",
  "dia_de_descanso",
  "dia_livre",
]);

/**
 * Normaliza texto livre para chave snake_case minúscula sem acentos.
 */
export function normalizeActivityLookupKey(raw: string): string {
  return raw
    .trim()
    .replace(/^'+/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s/_-]+/g, "_");
}

/**
 * Mapa compartilhado de aliases de atividades físicas para o enum canônico `ActivityType`.
 */
export const ACTIVITY_ALIAS_MAP: Record<string, ActivityType> = {
  ...Object.fromEntries(
    ACTIVITY_TYPES.map((type) => [normalizeActivityLookupKey(type), type])
  ),
  ...Object.fromEntries(
    Object.entries(ACTIVITY_LABELS).map(([type, label]) => [
      normalizeActivityLookupKey(label),
      type as ActivityType,
    ])
  ),
  rodagem: "rodagem_leve",
  leve: "rodagem_leve",
  regenerativo: "rodagem_leve",
  regenerativa: "rodagem_leve",
  rodagem_regenerativa: "rodagem_leve",
  easy: "rodagem_leve",
  easy_run: "rodagem_leve",
  corrida: "corrida_continua",
  continua: "corrida_continua",
  continuo: "corrida_continua",
  corrida_de_rua: "corrida_continua",
  esteira: "corrida_continua",
  treadmill: "corrida_continua",
  run: "corrida_continua",
  tempo: "tempo_run",
  ritmo: "tempo_run",
  teste_taf: "tempo_run",
  simulado_taf: "tempo_run",
  simulado: "tempo_run",
  taf: "tempo_run",
  limiar: "tempo_run",
  threshold: "tempo_run",
  intervalado: "corrida_intervalada",
  intervalada: "corrida_intervalada",
  tiro: "corrida_intervalada",
  tiros: "corrida_intervalada",
  fartlek: "corrida_intervalada",
  velocidade: "corrida_intervalada",
  hiit: "corrida_intervalada",
  longo: "longao",
  long_run: "longao",
  longao_progressivo: "longao",
  walk: "caminhada",
  caminhada_leve: "caminhada",
};

function parseValidatedDateKeyParts(
  dateKey: string
): { year: number; month: number; day: number; epochDays: number; utcDayOfWeek: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return {
    year,
    month,
    day,
    epochDays: Math.round(utcMidnightMs / MS_PER_DAY),
    utcDayOfWeek: utcDate.getUTCDay(),
  };
}

/**
 * Formata uma data no fuso `America/Fortaleza` (`YYYY-MM-DD`).
 * Preserva datas civis puras (`YYYY-MM-DD`) e converte timestamps UTC/ISO para o dia civil de Fortaleza.
 */
export function toFortalezaDateKey(dateInput: Date | string | null | undefined): string {
  if (dateInput === null || dateInput === undefined) return "";

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return parseValidatedDateKeyParts(trimmed) ? trimmed : "";
    }
  }

  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const parts = FORTALEZA_DATE_FORMATTER.formatToParts(parsed);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

/**
 * Calcula a diferença em dias civis de Fortaleza (`dateA - dateB`).
 * Retorna `NaN` caso qualquer uma das entradas seja inválida.
 */
export function diffFortalezaDays(dateA: Date | string, dateB: Date | string): number {
  const keyA = toFortalezaDateKey(dateA);
  const keyB = toFortalezaDateKey(dateB);
  const partsA = parseValidatedDateKeyParts(keyA);
  const partsB = parseValidatedDateKeyParts(keyB);
  if (!partsA || !partsB) return Number.NaN;
  return partsA.epochDays - partsB.epochDays;
}

/**
 * Soma ou subtrai dias civis a partir de uma data/chave `YYYY-MM-DD` sem depender do fuso do host.
 */
export function shiftFortalezaDays(dateInput: Date | string, deltaDays: number): string {
  if (!Number.isFinite(deltaDays)) return "";
  const key = toFortalezaDateKey(dateInput);
  const parts = parseValidatedDateKeyParts(key);
  if (!parts) return "";

  const targetMs = (parts.epochDays + Math.trunc(deltaDays)) * MS_PER_DAY;
  return new Date(targetMs).toISOString().slice(0, 10);
}

/**
 * Retorna o nome do dia da semana em português (`Segunda`, `Terça`, ...) no calendário de Fortaleza.
 */
export function getFortalezaWeekdayLabel(dateInput: Date | string): string {
  const key = toFortalezaDateKey(dateInput);
  const parts = parseValidatedDateKeyParts(key);
  if (!parts) return "";
  return WEEKDAY_LABELS_PT_BR[parts.utcDayOfWeek];
}

export interface FortalezaWeekBounds {
  weekStart: string; // Segunda-feira YYYY-MM-DD
  weekEnd: string; // Domingo YYYY-MM-DD
  label: string; // Ex.: "16/11 – 22/11"
}

function formatShortDayMonth(dateKey: string): string {
  const parts = parseValidatedDateKeyParts(dateKey);
  if (!parts) return "";
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`;
}

/**
 * Calcula os limites da semana (Segunda a Domingo) no calendário de `America/Fortaleza`.
 */
export function getFortalezaWeekBounds(
  referenceDate: Date | string = new Date()
): FortalezaWeekBounds {
  const key = toFortalezaDateKey(referenceDate);
  const parts = parseValidatedDateKeyParts(key);
  if (!parts) {
    throw new RangeError(`Data inválida para cálculo semanal: ${String(referenceDate)}`);
  }

  const offsetToMonday = parts.utcDayOfWeek === 0 ? -6 : 1 - parts.utcDayOfWeek;
  const weekStart = shiftFortalezaDays(key, offsetToMonday);
  const weekEnd = shiftFortalezaDays(weekStart, 6);

  return {
    weekStart,
    weekEnd,
    label: `${formatShortDayMonth(weekStart)} – ${formatShortDayMonth(weekEnd)}`,
  };
}

/**
 * Desloca uma semana em `offsetWeeks` semanas (negativo = passado, positivo = futuro) retornando `weekStart` (Segunda).
 */
export function shiftFortalezaWeek(
  weekReference: Date | string,
  offsetWeeks: number
): string {
  const { weekStart } = getFortalezaWeekBounds(weekReference);
  return shiftFortalezaDays(weekStart, Math.trunc(offsetWeeks) * 7);
}

/**
 * Indica se o instante informado está na janela de virada semanal dominical em `America/Fortaleza`
 * (domingo com hora local >= `cutoffHour`, padrão 22h — após revisão do Gemini e Cron das 22h).
 */
export function isSundayPostRolloverFortaleza(
  referenceDate: Date = new Date(),
  cutoffHour = 22
): boolean {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    return false;
  }
  const parts = FORTALEZA_WEEKDAY_HOUR_FORMATTER.formatToParts(referenceDate);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hourRaw = parts.find((part) => part.type === "hour")?.value;
  const hour = hourRaw !== undefined ? Number(hourRaw) : Number.NaN;
  return weekday === "Sun" && Number.isFinite(hour) && hour >= cutoffHour;
}

/**
 * Retorna a segunda-feira (`YYYY-MM-DD`) que deve ser exibida por padrão no `WeeklyAdherenceCard`:
 * - Por padrão, retorna a semana corrente (`Segunda..Domingo`) em `America/Fortaleza`.
 * - Quando for domingo `>= 22:00` em Fortaleza **e** já houver planejamento para a próxima semana
 *   (`hasNextPlannedWeek === true`), antecipa o foco para a segunda-feira seguinte.
 */
export function getDefaultDisplayWeekStartFortaleza(
  referenceDate: Date = new Date(),
  hasNextPlannedWeek = false,
  cutoffHour = 22
): string {
  const currentWeekStart = getFortalezaWeekBounds(referenceDate).weekStart;
  if (hasNextPlannedWeek && isSundayPostRolloverFortaleza(referenceDate, cutoffHour)) {
    return shiftFortalezaDays(currentWeekStart, 7);
  }
  return currentWeekStart;
}

/**
 * Indica se o texto da coluna `Tipo` representa dia de descanso (`Descanso`, `Off`, `Rest`, `Folga`).
 */
export function isRestPlanActivity(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const key = normalizeActivityLookupKey(raw);
  return key.length > 0 && REST_ACTIVITY_KEYS.has(key);
}

/**
 * Normaliza o rótulo de atividade prescrita no `Plano_Semanal` (ou treino) para o enum canônico `ActivityType`.
 * Retorna `null` para dias de descanso, strings vazias ou modalidades não relacionadas a corrida/caminhada.
 */
export function normalizePlanActivityType(raw: unknown): ActivityType | null {
  if (typeof raw !== "string") return null;
  const key = normalizeActivityLookupKey(raw);
  if (!key || REST_ACTIVITY_KEYS.has(key)) {
    return null;
  }

  const exact = ACTIVITY_ALIAS_MAP[key];
  if (exact) {
    return exact;
  }

  // Fallback por tokens para descrições curtas da IA (ex.: "Treino de Tiro 400m", "Caminhada leve", "Corrida na esteira")
  if (key.includes("caminh") || key.includes("walk")) {
    return "caminhada";
  }
  if (key.includes("interval") || key.includes("tiro") || key.includes("fartlek") || key.includes("hiit")) {
    return "corrida_intervalada";
  }
  if (key.includes("longo") || key.includes("longao")) {
    return "longao";
  }
  if (key.includes("tempo_run") || key.includes("ritmo") || key.includes("limiar") || key.includes("taf") || key.includes("threshold")) {
    return "tempo_run";
  }
  if (key.includes("rodagem") || key.includes("regenerativ")) {
    return "rodagem_leve";
  }
  if (
    key.includes("corrida") ||
    key.includes("esteira") ||
    key.includes("treadmill") ||
    key === "run" ||
    key.startsWith("run_") ||
    key.includes("_run")
  ) {
    return "corrida_continua";
  }

  return null;
}

/**
 * Retorna a família biomecânica da atividade (`"run"` para os 5 tipos de corrida, `"walk"` para caminhada).
 */
export function getActivityFamily(activityType: ActivityType): "run" | "walk" {
  return activityType === "caminhada" ? "walk" : "run";
}

/**
 * Verifica se a atividade prescrita no plano e a atividade registrada na sessão são compatíveis na mesma família.
 */
export function arePlanActivitiesCompatible(planType: string, sessionType: string): boolean {
  if (isRestPlanActivity(planType) || isRestPlanActivity(sessionType)) {
    return false;
  }
  const normalizedPlan = normalizePlanActivityType(planType);
  const normalizedSession = normalizePlanActivityType(sessionType);
  if (!normalizedPlan || !normalizedSession) {
    return false;
  }
  return getActivityFamily(normalizedPlan) === getActivityFamily(normalizedSession);
}

/**
 * Verifica se plano e sessão correspondem exatamente ao mesmo tipo canônico de atividade.
 */
export function isExactPlanActivityMatch(planType: string, sessionType: string): boolean {
  const normalizedPlan = normalizePlanActivityType(planType);
  const normalizedSession = normalizePlanActivityType(sessionType);
  return normalizedPlan !== null && normalizedSession !== null && normalizedPlan === normalizedSession;
}

/**
 * Normaliza strings de status da aba `Plano_Semanal` para o conjunto canônico permitido.
 */
export function normalizeWeeklyPlanStatus(raw: unknown): WeeklyPlanStatus {
  if (typeof raw !== "string") return "Planejado";
  const key = normalizeActivityLookupKey(raw);
  if (key === "concluido" || key === "concluida" || key === "completed" || key === "done") {
    return "Concluído";
  }
  if (key === "adaptado" || key === "adaptada" || key === "adapted") {
    return "Adaptado";
  }
  if (key === "parcial" || key === "partial") {
    return "Parcial";
  }
  if (key === "perdido" || key === "perdida" || key === "missed") {
    return "Perdido";
  }
  return "Planejado";
}

/**
 * Indica se o status representa um treino já realizado/vinculado (`Concluído`, `Adaptado` ou `Parcial`).
 */
export function isRealizedWeeklyPlanStatus(
  status: unknown
): status is "Concluído" | "Adaptado" | "Parcial" {
  const normalized = normalizeWeeklyPlanStatus(status);
  return (
    normalized === "Concluído" ||
    normalized === "Adaptado" ||
    normalized === "Parcial"
  );
}

export interface TargetPaceRangeSeconds {
  minPaceSeconds: number;
  maxPaceSeconds: number;
}

/**
 * Extrai a faixa de pace alvo em segundos/km a partir de `targetPaceFormatted`.
 * Suporta faixas (`'5:45-6:00`, `5:45–6:00`, `5:45 a 6:00`, `5'45"-6'00"`, `05:45:00 - 06:00:00`),
 * valor único (`5:13`, `05:13:00`, `~5:30/km`) e texto com pace embutido (`Z2 (5:50-6:10/km)`).
 * Normaliza ordem crescente (`minPaceSeconds <= maxPaceSeconds`).
 */
export function parseTargetPaceRangeSeconds(
  raw?: string | null
): TargetPaceRangeSeconds | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^'+/, "").trim();
  if (!cleaned || /^[-—–]+$/.test(cleaned)) {
    return null;
  }

  const paceRegex =
    /(?:^|[^\d])(?:(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2})\s*[:'’]\s*(\d{2})(?:"|''|”)?)(?=$|[^\d:])/g;

  const parsedPaces: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = paceRegex.exec(cleaned)) !== null) {
    let minutes: number;
    let seconds: number;

    if (match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      const s = Number(match[3]);
      if (h === 0 && m >= 2 && m <= 25 && s >= 0 && s < 60) {
        minutes = m;
        seconds = s;
      } else if (s === 0 && h >= 2 && h <= 25 && m >= 0 && m < 60) {
        minutes = h;
        seconds = m;
      } else {
        continue;
      }
    } else if (match[4] !== undefined && match[5] !== undefined) {
      minutes = Number(match[4]);
      seconds = Number(match[5]);
      if (seconds < 0 || seconds >= 60) {
        continue;
      }
    } else {
      continue;
    }

    const totalSeconds = minutes * 60 + seconds;
    if (
      totalSeconds >= MIN_VALID_PACE_SECONDS &&
      totalSeconds <= MAX_VALID_PACE_SECONDS
    ) {
      parsedPaces.push(totalSeconds);
    }
  }

  if (parsedPaces.length === 1) {
    return {
      minPaceSeconds: parsedPaces[0],
      maxPaceSeconds: parsedPaces[0],
    };
  }
  if (parsedPaces.length === 2) {
    return {
      minPaceSeconds: Math.min(parsedPaces[0], parsedPaces[1]),
      maxPaceSeconds: Math.max(parsedPaces[0], parsedPaces[1]),
    };
  }
  return null;
}

/**
 * Identifica incompatibilidade de intensidade/família entre atividade planejada e realizada:
 * - Troca entre alta intensidade (`corrida_intervalada`, `tempo_run`) e baixa intensidade (`rodagem_leve`, `caminhada`);
 * - Ou troca de família biomecânica (`run ↔ walk`).
 */
export function classifyActivityIntensityMismatch(
  planType: string,
  sessionType: string
): boolean {
  if (isRestPlanActivity(planType) || isRestPlanActivity(sessionType)) {
    return false;
  }
  const normalizedPlan = normalizePlanActivityType(planType);
  const normalizedSession = normalizePlanActivityType(sessionType);
  if (!normalizedPlan || !normalizedSession) {
    return false;
  }

  if (getActivityFamily(normalizedPlan) !== getActivityFamily(normalizedSession)) {
    return true;
  }

  const planHigh = HIGH_INTENSITY_ACTIVITIES.has(normalizedPlan);
  const planLow = LOW_INTENSITY_ACTIVITIES.has(normalizedPlan);
  const sessionHigh = HIGH_INTENSITY_ACTIVITIES.has(normalizedSession);
  const sessionLow = LOW_INTENSITY_ACTIVITIES.has(normalizedSession);

  return (planHigh && sessionLow) || (planLow && sessionHigh);
}

export interface WeeklyMatchPlanInput {
  activityType?: string | null;
  targetDistanceKm?: number | null;
  targetPaceFormatted?: string | null;
}

export interface WeeklyMatchSessionInput {
  activityType?: string | null;
  distanceKm: number;
  durationSeconds?: number | null;
  paceSeconds?: number | null;
}

export interface WeeklyMatchEvaluationResult {
  status: "Concluído" | "Adaptado" | "Parcial" | null;
  reasonCodes: WeeklyAdaptationReasonCode[];
  reasons: string[];
}

function resolveSessionPaceSeconds(
  session: WeeklyMatchSessionInput
): number | null {
  if (
    typeof session.paceSeconds === "number" &&
    Number.isFinite(session.paceSeconds) &&
    session.paceSeconds > 0
  ) {
    return session.paceSeconds;
  }
  if (
    typeof session.durationSeconds === "number" &&
    Number.isFinite(session.durationSeconds) &&
    session.durationSeconds > 0 &&
    Number.isFinite(session.distanceKm) &&
    session.distanceKm > 0
  ) {
    return Math.round(session.durationSeconds / session.distanceKm);
  }
  return null;
}

/**
 * Avaliação detalhada do pareamento entre prescrição e sessão realizada:
 * 1. `distanceKm <= 0` ou (`targetDistanceKm > 0` e `ratio < 0.40`) -> `null` (inelegível)
 * 2. `targetDistanceKm > 0` e `0.40 <= ratio < 0.85` -> `"Parcial"` (0.50 — não infla para 0.75)
 * 3. Volume base atingido (`ratio >= 0.85` ou sem meta de distância):
 *    - `"Adaptado"` (0.75) se `ratio > 1.25` OR pace fora de `±15 s/km` da faixa alvo OR choque de intensidade/família
 *    - `"Concluído"` (1.00) caso contrário
 */
export function evaluateWeeklyMatchDetailed(
  plan: WeeklyMatchPlanInput,
  session: WeeklyMatchSessionInput
): WeeklyMatchEvaluationResult {
  if (!Number.isFinite(session.distanceKm) || session.distanceKm <= 0) {
    return { status: null, reasonCodes: [], reasons: [] };
  }

  const hasTargetDistance =
    plan.targetDistanceKm !== null &&
    plan.targetDistanceKm !== undefined &&
    Number.isFinite(plan.targetDistanceKm) &&
    plan.targetDistanceKm > 0;

  let ratio = 1;
  if (hasTargetDistance) {
    ratio = session.distanceKm / (plan.targetDistanceKm as number);
    if (ratio + RATIO_EPSILON < 0.4) {
      return { status: null, reasonCodes: [], reasons: [] };
    }
    if (ratio + RATIO_EPSILON < 0.85) {
      return { status: "Parcial", reasonCodes: [], reasons: [] };
    }
  }

  const reasonCodes: WeeklyAdaptationReasonCode[] = [];

  if (hasTargetDistance && ratio - RATIO_EPSILON > WEEKLY_VOLUME_OVER_RATIO) {
    reasonCodes.push("volume_above");
  }

  const paceRange = parseTargetPaceRangeSeconds(plan.targetPaceFormatted);
  const sessionPaceSeconds = resolveSessionPaceSeconds(session);
  if (paceRange && sessionPaceSeconds !== null) {
    if (sessionPaceSeconds < paceRange.minPaceSeconds - WEEKLY_PACE_TOLERANCE_SECONDS) {
      reasonCodes.push("pace_faster");
    } else if (
      sessionPaceSeconds >
      paceRange.maxPaceSeconds + WEEKLY_PACE_TOLERANCE_SECONDS
    ) {
      reasonCodes.push("pace_slower");
    }
  }

  if (
    plan.activityType &&
    session.activityType &&
    classifyActivityIntensityMismatch(plan.activityType, session.activityType)
  ) {
    reasonCodes.push("type_changed");
  }

  if (reasonCodes.length > 0) {
    return {
      status: "Adaptado",
      reasonCodes,
      reasons: reasonCodes.map((code) => WEEKLY_ADAPTATION_REASON_LABELS[code]),
    };
  }

  return { status: "Concluído", reasonCodes: [], reasons: [] };
}

export interface EvaluateWeeklyMatchOptions {
  planActivityType?: string | null;
  sessionActivityType?: string | null;
  targetPaceFormatted?: string | null;
  sessionPaceSeconds?: number | null;
  sessionDurationSeconds?: number | null;
}

/**
 * Avalia elegibilidade e status do cruzamento com base na distância, pace alvo e tipo de atividade:
 * - Meta ausente ou `<= 0` (treino por tempo): `"Concluído"` ou `"Adaptado"` (se houver desvio de pace/tipo)
 * - `ratio > 1.25`, pace fora de `±15 s/km` ou incompatibilidade de intensidade/tipo (com volume base): `"Adaptado"`
 * - `0.85 <= ratio <= 1.25` sem desvios: `"Concluído"`
 * - `0.40 <= ratio < 0.85`: `"Parcial"`
 * - `ratio < 0.40`: `null` (inelegível — evita falso vínculo com aquecimentos curtos)
 */
export function evaluateWeeklyMatch(
  targetDistanceKm: number | null | undefined,
  sessionDistanceKm: number,
  options?: EvaluateWeeklyMatchOptions
): "Concluído" | "Adaptado" | "Parcial" | null {
  return evaluateWeeklyMatchDetailed(
    {
      activityType: options?.planActivityType,
      targetDistanceKm,
      targetPaceFormatted: options?.targetPaceFormatted,
    },
    {
      activityType: options?.sessionActivityType,
      distanceKm: sessionDistanceKm,
      durationSeconds: options?.sessionDurationSeconds,
      paceSeconds: options?.sessionPaceSeconds,
    }
  ).status;
}

/**
 * Define o status de um plano sem sessão vinculada na data de referência de Fortaleza:
 * `"Perdido"` estritamente se `plannedDate < ontem`; `"Planejado"` para ontem, hoje ou futuro.
 */
export function computeUnmatchedPlanStatus(
  plannedDate: Date | string,
  todayFortalezaKey: string
): "Planejado" | "Perdido" {
  const planKey = toFortalezaDateKey(plannedDate);
  const yesterdayKey = shiftFortalezaDays(todayFortalezaKey, -1);
  if (!planKey || !yesterdayKey) {
    return "Planejado";
  }
  return planKey < yesterdayKey ? "Perdido" : "Planejado";
}

export interface ReconcilablePlanItem {
  id: string;
  planExternalId: string;
  plannedDate: Date | string;
  activityType: string;
  targetDistanceKm: number | null;
  targetPaceFormatted?: string | null;
  status?: WeeklyPlanStatus | string;
  matchedSessionId?: string | null;
}

export interface ReconcilableSessionItem {
  id: string;
  sessionDate: Date | string;
  activityType: ActivityType | string;
  distanceKm: number;
  durationSeconds?: number;
  paceSeconds?: number | null;
}

export interface WeeklyReconciliationMatch {
  planId: string;
  planExternalId: string;
  sessionId: string;
  status: "Concluído" | "Adaptado" | "Parcial";
  pass: 1 | 2;
  dayDiff: number;
}

export interface WeeklyPlanStatusChange {
  planId: string;
  planExternalId: string;
  previousStatus: string;
  nextStatus: "Planejado" | "Perdido";
}

export interface WeeklyReconciliationResult {
  matches: WeeklyReconciliationMatch[];
  unmatchedUpdates: WeeklyPlanStatusChange[];
  missedCount: number;
}

export interface ComputeWeeklyReconciliationOptions {
  /**
   * Conjunto de chaves `YYYY-MM-DD` (Fortaleza) que possuem qualquer plano de treino ativo
   * no banco (incluindo itens já vinculados), usado para bloquear a Passada 2 (`±1 dia`).
   */
  occupiedPlanDateKeys?: ReadonlySet<string>;
}

interface CandidatePair {
  plan: ReconcilablePlanItem;
  session: ReconcilableSessionItem;
  status: "Concluído" | "Adaptado" | "Parcial";
  dayDiff: number;
  isSameFamily: boolean;
  isExactActivity: boolean;
  hasTypeMismatch: boolean;
  distanceDelta: number;
  negativeEffortScore: number;
  planDateKey: string;
  sessionTimestamp: number;
}

function toTimestampMs(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

const MATCH_STATUS_PRIORITY: Record<"Concluído" | "Adaptado" | "Parcial", number> = {
  Concluído: 0,
  Adaptado: 1,
  Parcial: 2,
};

function compareCandidatePairs(a: CandidatePair, b: CandidatePair): number {
  if (a.isSameFamily !== b.isSameFamily) {
    return a.isSameFamily ? -1 : 1;
  }
  if (a.isExactActivity !== b.isExactActivity) {
    return a.isExactActivity ? -1 : 1;
  }
  if (a.hasTypeMismatch !== b.hasTypeMismatch) {
    return a.hasTypeMismatch ? 1 : -1;
  }
  const statusDiff = MATCH_STATUS_PRIORITY[a.status] - MATCH_STATUS_PRIORITY[b.status];
  if (statusDiff !== 0) {
    return statusDiff;
  }
  if (a.distanceDelta !== b.distanceDelta) {
    return a.distanceDelta - b.distanceDelta;
  }
  if (a.negativeEffortScore !== b.negativeEffortScore) {
    return a.negativeEffortScore - b.negativeEffortScore;
  }
  if (a.planDateKey !== b.planDateKey) {
    return a.planDateKey.localeCompare(b.planDateKey);
  }
  if (a.sessionTimestamp !== b.sessionTimestamp) {
    return a.sessionTimestamp - b.sessionTimestamp;
  }
  const planIdCmp = a.plan.id.localeCompare(b.plan.id);
  if (planIdCmp !== 0) return planIdCmp;
  return a.session.id.localeCompare(b.session.id);
}

function hasValidNonRestActivityPair(planType: string, sessionType: string): boolean {
  if (isRestPlanActivity(planType) || isRestPlanActivity(sessionType)) {
    return false;
  }
  return (
    normalizePlanActivityType(planType) !== null &&
    normalizePlanActivityType(sessionType) !== null
  );
}

function buildPassCandidates(
  pendingPlans: readonly ReconcilablePlanItem[],
  freeSessions: readonly ReconcilableSessionItem[],
  pass: 1 | 2,
  occupiedPlanDateKeys: ReadonlySet<string>,
  usedPlanIds: ReadonlySet<string>,
  usedSessionIds: ReadonlySet<string>
): CandidatePair[] {
  const candidates: CandidatePair[] = [];

  for (const plan of pendingPlans) {
    if (usedPlanIds.has(plan.id)) continue;
    const planDateKey = toFortalezaDateKey(plan.plannedDate);
    if (!planDateKey) continue;

    for (const session of freeSessions) {
      if (usedSessionIds.has(session.id)) continue;
      const sessionDateKey = toFortalezaDateKey(session.sessionDate);
      if (!sessionDateKey) continue;

      const dayDiff = diffFortalezaDays(sessionDateKey, planDateKey);
      if (!Number.isFinite(dayDiff)) continue;

      if (pass === 1 && dayDiff !== 0) continue;
      if (pass === 2) {
        if (Math.abs(dayDiff) !== 1) continue;
        if (occupiedPlanDateKeys.has(sessionDateKey)) continue;
      }

      if (!hasValidNonRestActivityPair(plan.activityType, session.activityType)) {
        continue;
      }

      const isSameFamily = arePlanActivitiesCompatible(
        plan.activityType,
        session.activityType
      );
      if (pass === 2 && !isSameFamily) {
        continue;
      }

      const evaluation = evaluateWeeklyMatchDetailed(
        {
          activityType: plan.activityType,
          targetDistanceKm: plan.targetDistanceKm,
          targetPaceFormatted: plan.targetPaceFormatted,
        },
        {
          activityType: session.activityType,
          distanceKm: session.distanceKm,
          durationSeconds: session.durationSeconds,
          paceSeconds: session.paceSeconds,
        }
      );
      if (!evaluation.status) {
        continue;
      }

      const hasDistanceTarget =
        plan.targetDistanceKm !== null &&
        plan.targetDistanceKm !== undefined &&
        Number.isFinite(plan.targetDistanceKm) &&
        plan.targetDistanceKm > 0;

      candidates.push({
        plan,
        session,
        status: evaluation.status,
        dayDiff,
        isSameFamily,
        isExactActivity: isExactPlanActivityMatch(plan.activityType, session.activityType),
        hasTypeMismatch: classifyActivityIntensityMismatch(
          plan.activityType,
          session.activityType
        ),
        distanceDelta: hasDistanceTarget
          ? Math.abs(session.distanceKm - (plan.targetDistanceKm as number))
          : 0,
        negativeEffortScore: hasDistanceTarget
          ? 0
          : -((session.durationSeconds && session.durationSeconds > 0
              ? session.durationSeconds
              : session.distanceKm * 1000)),
        planDateKey,
        sessionTimestamp: toTimestampMs(session.sessionDate),
      });
    }
  }

  candidates.sort(compareCandidatePairs);
  return candidates;
}

/**
 * Executa o motor puro de reconciliação em 2 passadas entre metas do `Plano_Semanal` e sessões livres:
 * - Passada 1: mesmo dia em `America/Fortaleza` (`dayDiff === 0`), com corte `ratio >= 0.40` antes do ranking
 *   (aceitando troca `run ↔ walk` com prioridade menor e classificação `"Adaptado"`).
 * - Passada 2: tolerância de `±1 dia` somente se o dia da sessão não possuir outro plano ativo registrado e for da mesma família.
 * - Planos restantes sem vínculo recebem `"Perdido"` estritamente para `plannedDate < ontem` ou `"Planejado"`.
 */
export function computeWeeklyReconciliation(
  plans: readonly ReconcilablePlanItem[],
  freeSessions: readonly ReconcilableSessionItem[],
  todayFortalezaKey: string,
  options?: ComputeWeeklyReconciliationOptions
): WeeklyReconciliationResult {
  const occupiedPlanDateKeys = new Set<string>(options?.occupiedPlanDateKeys ?? []);
  const pendingPlans: ReconcilablePlanItem[] = [];

  for (const plan of plans) {
    if (isRestPlanActivity(plan.activityType)) continue;
    const planDateKey = toFortalezaDateKey(plan.plannedDate);
    if (planDateKey) {
      occupiedPlanDateKeys.add(planDateKey);
    }

    if (!plan.matchedSessionId && !isRealizedWeeklyPlanStatus(plan.status)) {
      pendingPlans.push(plan);
    }
  }

  const usedPlanIds = new Set<string>();
  const usedSessionIds = new Set<string>();
  const matches: WeeklyReconciliationMatch[] = [];

  for (const pass of [1, 2] as const) {
    const candidates = buildPassCandidates(
      pendingPlans,
      freeSessions,
      pass,
      occupiedPlanDateKeys,
      usedPlanIds,
      usedSessionIds
    );

    for (const pair of candidates) {
      if (usedPlanIds.has(pair.plan.id) || usedSessionIds.has(pair.session.id)) {
        continue;
      }
      usedPlanIds.add(pair.plan.id);
      usedSessionIds.add(pair.session.id);
      matches.push({
        planId: pair.plan.id,
        planExternalId: pair.plan.planExternalId,
        sessionId: pair.session.id,
        status: pair.status,
        pass,
        dayDiff: pair.dayDiff,
      });
    }
  }

  const unmatchedUpdates: WeeklyPlanStatusChange[] = [];
  let missedCount = 0;

  for (const plan of pendingPlans) {
    if (usedPlanIds.has(plan.id)) continue;

    const nextStatus = computeUnmatchedPlanStatus(plan.plannedDate, todayFortalezaKey);
    if (nextStatus === "Perdido") {
      missedCount += 1;
    }

    const previousStatus = plan.status ?? "Planejado";
    if (previousStatus !== nextStatus) {
      unmatchedUpdates.push({
        planId: plan.id,
        planExternalId: plan.planExternalId,
        previousStatus,
        nextStatus,
      });
    }
  }

  return {
    matches,
    unmatchedUpdates,
    missedCount,
  };
}

/**
 * Verifica se uma sessão já vinculada a um plano continua atendendo integralmente às regras
 * após edição (`PUT`) da sessão ou mudança da prescrição no `Plano_Semanal`,
 * ou se deve ser desvinculada antes de re-reconciliar.
 */
export function evaluateLinkedSessionValidity(
  plan: Pick<
    ReconcilablePlanItem,
    "plannedDate" | "activityType" | "targetDistanceKm" | "targetPaceFormatted"
  >,
  session: Pick<
    ReconcilableSessionItem,
    "sessionDate" | "activityType" | "distanceKm" | "durationSeconds" | "paceSeconds"
  >,
  options?: {
    occupiedPlanDateKeys?: ReadonlySet<string>;
    hasSameDayPlanAtSessionDate?: boolean;
  }
): { valid: boolean; nextStatus: "Concluído" | "Adaptado" | "Parcial" | null } {
  const planDateKey = toFortalezaDateKey(plan.plannedDate);
  const sessionDateKey = toFortalezaDateKey(session.sessionDate);
  if (!planDateKey || !sessionDateKey) {
    return { valid: false, nextStatus: null };
  }

  const dayDiff = diffFortalezaDays(sessionDateKey, planDateKey);
  if (!Number.isFinite(dayDiff) || Math.abs(dayDiff) > 1) {
    return { valid: false, nextStatus: null };
  }

  if (!hasValidNonRestActivityPair(plan.activityType, session.activityType)) {
    return { valid: false, nextStatus: null };
  }

  if (Math.abs(dayDiff) === 1) {
    const blockedBySameDayPlan =
      options?.hasSameDayPlanAtSessionDate ||
      Boolean(options?.occupiedPlanDateKeys?.has(sessionDateKey));
    if (blockedBySameDayPlan) {
      return { valid: false, nextStatus: null };
    }
    if (!arePlanActivitiesCompatible(plan.activityType, session.activityType)) {
      return { valid: false, nextStatus: null };
    }
  }

  const evaluation = evaluateWeeklyMatchDetailed(
    {
      activityType: plan.activityType,
      targetDistanceKm: plan.targetDistanceKm,
      targetPaceFormatted: plan.targetPaceFormatted,
    },
    {
      activityType: session.activityType,
      distanceKm: session.distanceKm,
      durationSeconds: session.durationSeconds,
      paceSeconds: session.paceSeconds,
    }
  );
  if (!evaluation.status) {
    return { valid: false, nextStatus: null };
  }

  return { valid: true, nextStatus: evaluation.status };
}

export interface WeeklyAdherenceSummary {
  totalPlanned: number;
  completed: number;
  adapted: number;
  partial: number;
  planned: number;
  missed: number;
  adherencePercent: number | null;
}

/**
 * Calcula o resumo de aderência semanal (`Concluído = 1.0`, `Adaptado = 0.75`, `Parcial = 0.5`),
 * retornando `adherencePercent: null` quando não há plano cadastrado (nunca `NaN`).
 */
export function calculateWeeklyAdherenceSummary(
  items: ReadonlyArray<{ status: string }>
): WeeklyAdherenceSummary {
  let completed = 0;
  let adapted = 0;
  let partial = 0;
  let planned = 0;
  let missed = 0;

  for (const item of items) {
    const normalized = normalizeWeeklyPlanStatus(item.status);
    if (normalized === "Concluído") completed += 1;
    else if (normalized === "Adaptado") adapted += 1;
    else if (normalized === "Parcial") partial += 1;
    else if (normalized === "Perdido") missed += 1;
    else planned += 1;
  }

  const totalPlanned = items.length;
  if (totalPlanned === 0) {
    return {
      totalPlanned: 0,
      completed: 0,
      adapted: 0,
      partial: 0,
      planned: 0,
      missed: 0,
      adherencePercent: null,
    };
  }

  const adherencePercent = Math.min(
    100,
    Math.round(
      ((completed * 1.0 + adapted * 0.75 + partial * 0.5) / totalPlanned) * 100
    )
  );

  return {
    totalPlanned,
    completed,
    adapted,
    partial,
    planned,
    missed,
    adherencePercent,
  };
}

export interface RollingWeekAdherenceItem {
  weekStart: string;
  weekEnd: string;
  label: string;
  adherencePercent: number;
  completed: number;
  adapted: number;
  partial: number;
  totalPlanned: number;
}

export interface RollingFourWeeksAdherenceResult {
  averagePercent: number | null;
  weeksCount: number;
  weeks: RollingWeekAdherenceItem[];
}

/**
 * Calcula a média consolidada de aderência das até 4 semanas mais recentes que possuam plano
 * (até `upToWeekStartKey`, quando informada), ignorando semanas intermediárias sem planejamento.
 */
export function calculateRollingFourWeeksAdherence(
  items: ReadonlyArray<{ plannedDate: Date | string; status: string }>,
  upToWeekStartKey?: string
): RollingFourWeeksAdherenceResult {
  const byWeek = new Map<
    string,
    { bounds: FortalezaWeekBounds; statuses: Array<{ status: string }> }
  >();

  for (const item of items) {
    const key = toFortalezaDateKey(item.plannedDate);
    if (!key) continue;

    const bounds = getFortalezaWeekBounds(key);
    if (upToWeekStartKey && bounds.weekStart > upToWeekStartKey) {
      continue;
    }

    const bucket = byWeek.get(bounds.weekStart) ?? { bounds, statuses: [] };
    bucket.statuses.push({ status: item.status });
    byWeek.set(bounds.weekStart, bucket);
  }

  const recentWeeks = Array.from(byWeek.entries())
    .filter(([, group]) => group.statuses.length > 0)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4)
    .map(([weekStart, group]) => {
      const summary = calculateWeeklyAdherenceSummary(group.statuses);
      return {
        weekStart,
        weekEnd: group.bounds.weekEnd,
        label: group.bounds.label,
        adherencePercent: summary.adherencePercent ?? 0,
        completed: summary.completed,
        adapted: summary.adapted,
        partial: summary.partial,
        totalPlanned: summary.totalPlanned,
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  if (recentWeeks.length === 0) {
    return {
      averagePercent: null,
      weeksCount: 0,
      weeks: [],
    };
  }

  const sum = recentWeeks.reduce((acc, week) => acc + week.adherencePercent, 0);
  return {
    averagePercent: Math.round(sum / recentWeeks.length),
    weeksCount: recentWeeks.length,
    weeks: recentWeeks,
  };
}
