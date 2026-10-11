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

export interface IntervalStage {
  index: number;
  type: StageType;
  durationSeconds: Seconds;
  speedKmh: KmPerHour;
  distanceKm: Kilometers;
  paceFormatted: string;
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
}

export interface IntervalSession {
  totalTimeSeconds: Seconds;
  totalDistanceKm: Kilometers;
  averageSpeedKmh: KmPerHour;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  stages: IntervalStage[];
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
export interface GoalSplit {
  index: number;
  distanceKm: Kilometers;
  accumulatedDistanceKm: Kilometers;
  splitTimeSeconds: Seconds;
  splitTimeFormatted: string;
  accumulatedTimeSeconds: Seconds;
  accumulatedTimeFormatted: string;
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
