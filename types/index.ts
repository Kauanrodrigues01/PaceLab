// ─── Tipos primitivos com semântica explícita ────────────────────────────────
export type Seconds = number;
export type Kilometers = number;
export type KmPerHour = number;
export type SecondsPerKm = number;

// ─── Calculadora Principal ────────────────────────────────────────────────────
export interface PaceResult {
  paceSeconds: SecondsPerKm;
  paceFormatted: string; // e.g. "6:40"
  speedKmh: KmPerHour;
}

// ─── TAF ─────────────────────────────────────────────────────────────────────
export interface TafSplit {
  lap: number;
  distanceKm: Kilometers;
  accumulatedDistanceKm: Kilometers;
  lapTimeSeconds: Seconds;
  lapTimeFormatted: string;
  accumulatedTimeSeconds: Seconds;
  accumulatedTimeFormatted: string;
  progressPercent: number;
}

export interface TafResult {
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  distancePerMinuteKm: Kilometers;
  splits: TafSplit[];
  // Campos de progresso (quando distância atual informada)
  currentDistanceKm?: Kilometers;
  targetDistanceKm: Kilometers;
  progressPercent?: number;
  remainingDistanceKm?: number;
}

export interface FixedTargetResult {
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  targetDistanceKm: Kilometers;
  maxTimeSeconds: Seconds;
  maxTimeFormatted: string;
}

// ─── Treino Intervalado ───────────────────────────────────────────────────────
export type StageType = "warmup" | "run" | "walk" | "cooldown";
export type IntervalLimitType = "none" | "distance" | "time";

export interface IntervalStage {
  index: number;
  type: StageType;
  durationSeconds: Seconds;
  speedKmh: KmPerHour;
  distanceKm: Kilometers;
  paceFormatted: string;
  isTruncated?: boolean; // Indica se a etapa foi cortada para respeitar o limite
}

export interface IntervalConfig {
  warmupDurationSeconds: Seconds;
  warmupSpeedKmh: KmPerHour;
  runDurationSeconds: Seconds;
  runSpeedKmh: KmPerHour;
  walkDurationSeconds: Seconds;
  walkSpeedKmh: KmPerHour;
  repetitions: number;
  cooldownDurationSeconds: Seconds;
  cooldownSpeedKmh: KmPerHour;
  // Parâmetros opcionais de limite
  limitType?: IntervalLimitType;
  maxDistanceKm?: Kilometers;
  maxDurationSeconds?: Seconds;
}

export interface IntervalLimitInfo {
  type: IntervalLimitType;
  targetValue: number;
  truncatedStageIndex?: number;
  stagesRemovedCount?: number;
}

export interface IntervalSession {
  totalTimeSeconds: Seconds;
  totalDistanceKm: Kilometers;
  averageSpeedKmh: KmPerHour;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  stages: IntervalStage[];
  limitInfo?: IntervalLimitInfo;
}

// ─── Médias de Pace ───────────────────────────────────────────────────────────
export interface PaceEntry {
  paceStr: string; // e.g. "6:40"
  distanceKm?: Kilometers;
}

export interface PaceAverageResult {
  count: number;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  speedKmh: KmPerHour;
  fastestPaceSeconds: SecondsPerKm;
  fastestPaceFormatted: string;
  slowestPaceSeconds: SecondsPerKm;
  slowestPaceFormatted: string;
  differenceSeconds: Seconds;
  differenceFormatted: string;
  /** Chave: distância em km (e.g. "1.6"), valor: tempo formatado */
  estimatedTimes: Record<string, string>;
}

// ─── Metas e Parciais ─────────────────────────────────────────────────────────
export type PacingStrategy = "even" | "negative" | "progressive";

export interface GoalSplit {
  index: number;
  distanceKm: Kilometers;
  accumulatedDistanceKm: Kilometers;
  splitTimeSeconds: Seconds;
  splitTimeFormatted: string;
  accumulatedTimeSeconds: Seconds;
  accumulatedTimeFormatted: string;
  paceFormatted?: string;
  strategyDiffPercent?: number;
}

export interface GoalResult {
  totalTimeSeconds: Seconds;
  totalTimeFormatted: string;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  splits: GoalSplit[];
}

// ─── Histórico ────────────────────────────────────────────────────────────────
export interface HistoryEntry {
  id: string;
  date: string; // ISO 8601
  distanceKm: Kilometers;
  timeSeconds: Seconds;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  notes?: string;
  createdAt: string; // ISO 8601
}

// ─── Erros de validação ───────────────────────────────────────────────────────
export type ValidationResult =
  | { valid: true }
  | { valid: false; message: string };

// ─── Evolução do TAF & Persistência Relacional (Prisma ORM) ───────────────────
export interface LapDetail {
  lapNumber: number;
  durationSeconds: Seconds;
  distanceMeters: number;
  paceFormatted?: string;
}

export const ACTIVITY_TYPES = [
  "rodagem_leve",
  "corrida_continua",
  "tempo_run",
  "corrida_intervalada",
  "longao",
  "caminhada",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_SOURCES = ["manual", "gpx_upload", "fit_upload", "sheets"] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type LocationType =
  | "pista_400m"
  | "rua_plana"
  | "parque_praca"
  | "esteira"
  | "outro";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  rodagem_leve: "Rodagem Leve",
  corrida_continua: "Corrida Contínua",
  tempo_run: "Tempo Run / Ritmo",
  corrida_intervalada: "Intervalado / Tiros",
  longao: "Longão",
  caminhada: "Caminhada",
};

export const SOURCE_LABELS: Record<ActivitySource, string> = {
  manual: "Manual",
  gpx_upload: "Strava GPX",
  fit_upload: "Strava FIT",
  sheets: "Google Sheets",
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  pista_400m: "Pista de Atletismo (400m)",
  rua_plana: "Rua Plana",
  parque_praca: "Parque / Praça",
  esteira: "Esteira",
  outro: "Outro Percurso",
};

export interface TafAttempt {
  id: string;
  userId?: string | null;
  source?: ActivitySource;
  externalId?: string | null;
  syncedToSheetsAt?: string | null;
  testDate: string; // ISO 8601
  targetDurationSeconds: Seconds; // Padrão 720 (12 min)
  actualDurationSeconds: Seconds;
  distanceMeters: number;
  speedKmh: KmPerHour;
  paceSeconds: SecondsPerKm;
  paceFormatted: string; // e.g. "5:13"
  locationType?: LocationType | null;
  shoeName?: string | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  notes?: string | null;
  laps?: LapDetail[];
  createdAt: string;
  updatedAt: string;
  // Campos computados em tempo de execução
  isPersonalRecord?: boolean;
  deltaPreviousMeters?: number | null;
  deficitTargetMeters?: number;
}

export interface SplitDetail {
  kilometer: number;
  durationSeconds: Seconds;
  paceFormatted: string;
  distanceKm?: Kilometers;
  paceSeconds?: SecondsPerKm;
  avgHeartRate?: number | null;
  elevationDiffM?: number | null;
}

export interface ActivityParseWarning {
  code: string;
  message: string;
  count?: number;
}

export interface TafWindowSummary {
  targetDurationSeconds: Seconds; // Padrão 720 (12 min)
  actualDurationSeconds: Seconds;
  distanceMeters: number;
  speedKmh: KmPerHour;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  windowStartOffsetSeconds: number;
  windowEndOffsetSeconds: number;
  isShorterThanTarget: boolean;
  laps: LapDetail[];
}

export interface ActivityParsePreview {
  source: "fit_upload" | "gpx_upload";
  filesUsed: Array<"fit" | "gpx">;
  name: string | null;
  rawType: string | null;
  sourceActivityKind: "run" | "walk" | "unknown";
  isIndoor: boolean;
  startedAt: string;
  distanceKm: Kilometers;
  durationSeconds: Seconds;
  elapsedSeconds: Seconds;
  speedKmh: KmPerHour;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  elevationGainM: number | null;
  activeCalories: number | null;
  avgTemperatureC: number | null;
  splits: SplitDetail[];
  laps: LapDetail[];
  externalId: string;
  pointCount: number;
  warnings: ActivityParseWarning[];
  alreadyExists: boolean;
  existingTrainingId: string | null;
  alreadyExistsAttempt?: boolean;
  existingAttemptId?: string | null;
  tafWindow?: TafWindowSummary | null;
  suggestedActivityType: ActivityType | null;
  suggestedNotes: string;
  allowedActivityTypes: ActivityType[];
}

export interface TrainingSession {
  id: string;
  userId?: string | null;
  // Rastreabilidade e Anti-Duplicação
  source?: ActivitySource;
  externalId?: string | null;
  syncedToSheetsAt?: string | null;
  // Métricas Principais
  sessionDate: string; // ISO 8601
  activityType: ActivityType;
  distanceKm: Kilometers;
  durationSeconds: Seconds;
  elapsedSeconds?: Seconds | null;
  speedKmh: KmPerHour;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  // Telemetria Extra (Strava / GPX)
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  elevationGainM?: number | null;
  avgCadence?: number | null;
  shoeName?: string | null;
  // Contexto Subjetivo e Detalhes
  perceivedEffort?: number | null; // RPE 1 a 10
  bodyWeightKg?: number | null;
  notes?: string | null;
  splits?: SplitDetail[];
  // Novos campos de calorias (Fase 1/2 - Opcionais e retrocompatíveis)
  activeCalories?: number | null;
  totalCalories?: number | null;
  metValue?: number | null;
  calorieMethod?: string | null;
  calorieSource?: string | null;
  calorieMetadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Estimativa Calórica (Compêndio 2024) ──────────────────────────────────────
export interface CalorieResult {
  totalCalories: number; // Gasto bruto total (kcal)
  activeCalories: number; // Gasto ativo adicional ao repouso (kcal)
  metValue: number; // Valor MET utilizado
  compendiumCode: string; // Código de referência do Compêndio 2024
  compendiumDescription: string;
  method: "compendium_2024_met";
  version: "2024.1";
  weightUsedKg: number;
  durationMinutes: number;
}

export interface IntervalCalorieSegment {
  stageIndex: number;
  stageType: StageType;
  durationSeconds: Seconds;
  speedKmh: KmPerHour;
  metValue: number;
  compendiumCode: string;
  activeCalories: number;
  totalCalories: number;
}

export interface IntervalCalorieResult extends CalorieResult {
  segments: IntervalCalorieSegment[];
  isSegmented: boolean;
}

// ─── Perfil do Atleta & Histórico de Peso ────────────────────────────────────
export interface UserProfile {
  id: string;
  userId?: string | null;
  name?: string | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
  birthDate?: string | null;
  gender?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeightRecord {
  id: string;
  profileId?: string | null;
  weightKg: number;
  recordedAt: string;
  notes?: string | null;
  source?: "weekly_prompt" | "manual" | "training_sync" | string;
  createdAt: string;
}

export interface TafGoalConfig {
  id?: string;
  userId?: string | null;
  institutionName?: string | null;
  minDistanceMeters?: number; // Distância mínima para aprovação (ex: 2400)
  targetDistanceMeters: number; // Meta pessoal de segurança (ex: 2600)
  targetDurationMinutes: number; // Padrão 12
  targetExamDate?: string | null; // ISO 8601 YYYY-MM-DD

  // Barra Fixa
  pullupType?: "dinamica" | "isometria" | null;
  pullupMinReps?: number | null;
  pullupTargetReps?: number | null;
  pullupMinSeconds?: number | null;
  pullupTargetSeconds?: number | null;
  pullupDurationSeconds?: number | null;

  // Flexão de Braço
  pushupMinReps?: number | null;
  pushupTargetReps?: number | null;
  pushupDurationSeconds?: number | null;

  // Abdominal
  absMinReps?: number | null;
  absTargetReps?: number | null;
  absDurationSeconds?: number | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface PeriodMetrics {
  startDate: string;
  endDate: string;
  totalSessions: number;
  totalDistanceKm: Kilometers;
  totalDurationSeconds: Seconds;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  averageSpeedKmh: KmPerHour;
  tafTestsCount: number;
  bestTafDistanceMeters: number | null;
  averageRpe: number | null;
  hasLowSampleWarning: boolean;
}

export interface PeriodComparisonResult {
  periodA: PeriodMetrics;
  periodB: PeriodMetrics;
  deltaDistanceKm: Kilometers;
  deltaDistancePercent: number;
  deltaPaceSeconds: SecondsPerKm; // Negativo = mais rápido
  deltaTafDistanceMeters: number | null;
  summaryText: string;
}

export interface WeeklyVolume {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  distanceKm: Kilometers;
  sessionsCount: number;
}

export interface MonthlyVolume {
  monthLabel: string;
  monthKey: string; // "2026-10"
  distanceKm: Kilometers;
  sessionsCount: number;
}

export type TimeRangePreset = "7d" | "30d" | "90d" | "year" | "all";
export type SessionCountPreset = 2 | 4 | 6;
export type DashboardFilterMode = "preset" | "sessions" | "custom";

export type RpeIntensityZone = "leve" | "moderado" | "intenso" | "maximo";

export interface TrainingDashboardMetrics {
  totalKm: number;
  totalDurationSeconds: number;
  totalSessions: number;
  avgPaceSeconds: number;
  avgPaceFormatted: string;
  totalTrainingLoad: number;
  longestRunKm: number;
  avgRpe: number | null;
}

