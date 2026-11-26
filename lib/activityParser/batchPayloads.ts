import {
  ActivityParsePreview,
  ActivityType,
  BatchDuplicatePolicy,
  BatchImportSummary,
  BatchImportTarget,
  LOCATION_TYPES,
  LocationType,
  SheetsSyncDirection,
  TafAttempt,
  TafWindowSummary,
  TrainingSession,
} from "@/types";
import type { SheetsSyncReport, SheetsSyncStatus } from "@/lib/googleSheets/types";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import {
  buildCaloriePayload,
  type CaloriePersistencePayload,
  estimateTrainingCalories,
} from "@/lib/math/calories";
import {
  buildMirroredTrainingFromAttempt,
  combineTitleAndNotes,
  generateClientRecordId,
} from "@/lib/sheetsSyncUi";
import {
  type BatchActivityGroup,
  markDuplicateExternalIdsInBatch,
} from "./batchGrouping";
import { resolveDefaultActivityTypeFromPreview } from "./activitySuggestion";

export { resolveDefaultActivityTypeFromPreview } from "./activitySuggestion";

export const TRAINING_MIN_DISTANCE_KM = 0.05;
export const TRAINING_MAX_DISTANCE_KM = 100;
export const TRAINING_MIN_DURATION_SEC = 30;
export const TRAINING_MAX_DURATION_SEC = 86400;

export const TAF_MIN_DISTANCE_METERS = 100;
export const TAF_MAX_DISTANCE_METERS = 10000;
export const TAF_MIN_DURATION_SEC = 30;
export const TAF_MAX_DURATION_SEC = 7200;
export const TAF_TARGET_DURATION_SEC = 720;

export const MIN_BODY_WEIGHT_KG = 30;
export const MAX_BODY_WEIGHT_KG = 250;

export const LOCATION_TYPES_ORDER: readonly LocationType[] = LOCATION_TYPES;

export type BatchSaveOptions = { skipSheetsSync?: boolean };

export type BatchParseStatus =
  | "pending"
  | "parsing"
  | "ready"
  | "parse_error"
  | "cancelled";

export type BatchSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "updated"
  | "skipped"
  | "save_error";

export type BatchMirrorStatus = "idle" | "saved" | "updated" | "skipped" | "error";

export interface BatchQueueItem extends BatchActivityGroup {
  parseStatus: BatchParseStatus;
  parseError: string | null;
  preview: ActivityParsePreview | null;
  workoutTitle: string;
  activityType: ActivityType;
  locationType: LocationType;
  shoeName: string;
  perceivedEffort: number | null;
  notes: string;
  fallbackDate: string;
  fallbackDistanceKm: string;
  fallbackDurationSec: string;
  isDuplicateInBatch: boolean;
  duplicateOfItemId: string | null;
  saveStatus: BatchSaveStatus;
  saveError: string | null;
  skipReason: string | null;
  savedTraining: TrainingSession | null;
  savedAttempt: TafAttempt | null;
  mirrorStatus: BatchMirrorStatus;
  mirrorError: string | null;
}

export interface EffectivePreviewMetrics {
  distanceKm: number;
  durationSeconds: number;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
}

export interface WeightValidationResult {
  valid: boolean;
  weightKg: number | null;
  error?: string;
}

export interface BuildTrainingSessionParams {
  preview: ActivityParsePreview;
  activityType: ActivityType;
  workoutTitle?: string;
  notes?: string;
  shoeName?: string | null;
  perceivedEffort?: number | null;
  bodyWeightKg?: string | number | null;
  fallbackDate?: string;
  fallbackDistanceKm?: string | number;
  fallbackDurationSec?: string | number;
  onDuplicate?: "update";
  existingTrainingId?: string | null;
}

export interface BuildTafAttemptParams {
  preview: ActivityParsePreview;
  locationType: LocationType;
  workoutTitle?: string;
  notes?: string;
  shoeName?: string | null;
  fallbackDate?: string;
  fallbackDistanceKm?: string | number;
  fallbackDurationSec?: string | number;
  onDuplicate?: "update";
  existingAttemptId?: string | null;
}

export interface BatchQueueDefaults {
  activityTypeOverride?: ActivityType | "auto";
  locationTypeOverride?: LocationType | "auto";
  defaultShoeName?: string;
  defaultPerceivedEffort?: number | null;
}

export interface AnalyzeBatchOptions extends BatchQueueDefaults {
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    item: BatchQueueItem;
  }) => void;
}

export interface PersistBatchConfig {
  target: BatchImportTarget;
  duplicatePolicy: BatchDuplicatePolicy;
  bodyWeightKg?: string | number | null;
  alsoSaveToDiary?: boolean;
  concurrency?: number;
}

export interface PersistBatchDependencies {
  saveTraining: (
    training: TrainingSession & { onDuplicate?: "update" },
    isUpdate?: boolean,
    options?: BatchSaveOptions
  ) => Promise<TrainingSession>;
  saveAttempt: (
    attempt: TafAttempt & { onDuplicate?: "update" },
    isUpdate?: boolean,
    options?: BatchSaveOptions
  ) => Promise<TafAttempt>;
  getSheetsSyncStatus?: () => Promise<SheetsSyncStatus>;
  syncGoogleSheets?: (options?: {
    direction?: SheetsSyncDirection;
    forceFullResync?: boolean;
  }) => Promise<SheetsSyncReport>;
}

export interface PersistBatchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    item: BatchQueueItem;
  }) => void;
}

const EMPTY_CALORIE_PAYLOAD: CaloriePersistencePayload = {
  activeCalories: null,
  totalCalories: null,
  metValue: null,
  calorieMethod: null,
  calorieSource: null,
  calorieMetadata: null,
};

function parsePositiveNumberInput(
  raw: string | number | null | undefined
): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (typeof raw === "string") {
    const clean = raw.trim().replace(",", ".");
    if (!clean) return NaN;
    return parseFloat(clean);
  }
  return NaN;
}

/**
 * Resolve uma data ISO segura a partir do preview (com fallback opcional e instante atual como último recurso).
 */
export function resolveSafeIsoDate(
  primaryIso: string | null | undefined,
  fallbackInput?: string | null
): string {
  if (primaryIso && primaryIso.trim().length > 0) {
    const parsedPrimary = new Date(primaryIso);
    if (!Number.isNaN(parsedPrimary.getTime())) {
      return primaryIso;
    }
  }
  if (fallbackInput && fallbackInput.trim().length > 0) {
    const parsed = new Date(fallbackInput);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

export type BatchItemUiState =
  | "pending"
  | "parsing"
  | "parse_error"
  | "cancelled"
  | "saving"
  | "saved"
  | "updated"
  | "skipped"
  | "save_error"
  | "duplicate_in_batch"
  | "needs_manual_fallback"
  | "taf_out_of_bounds"
  | "duplicate_target_skip"
  | "duplicate_target_update"
  | "ready";

export interface BatchItemEligibility {
  uiState: BatchItemUiState;
  needsFallbackInputs: boolean;
  missingRequiredMetrics: boolean;
  effectiveMetrics: EffectivePreviewMetrics | null;
  tafWindow: TafWindowSummary | null;
  tafOutOfBounds: boolean;
  existsInActiveTarget: boolean;
  existsInOtherTarget: boolean;
  canSaveInBatch: boolean;
  blockingReason: string | null;
}

/**
 * Avalia o estado visual e a elegibilidade de salvamento de um item da fila de lote
 * conforme a seleção única global (`training` vs `taf_attempt`) e política de duplicados.
 */
export function evaluateBatchItemEligibility(
  item: Pick<
    BatchQueueItem,
    | "parseStatus"
    | "parseError"
    | "saveStatus"
    | "saveError"
    | "skipReason"
    | "preview"
    | "isDuplicateInBatch"
    | "fallbackDistanceKm"
    | "fallbackDurationSec"
  >,
  target: BatchImportTarget,
  duplicatePolicy: BatchDuplicatePolicy
): BatchItemEligibility {
  const preview = item.preview;
  const needsFallbackInputs = Boolean(
    preview &&
      (!preview.startedAt ||
        preview.distanceKm <= 0 ||
        preview.durationSeconds <= 0)
  );
  const effectiveMetrics = preview
    ? resolveEffectivePreviewMetrics(
        preview,
        item.fallbackDistanceKm,
        item.fallbackDurationSec
      )
    : null;
  const tafWindow =
    preview && target === "taf_attempt"
      ? computeFallbackTafWindow(
          preview,
          item.fallbackDistanceKm,
          item.fallbackDurationSec
        )
      : null;
  const existsInActiveTarget = preview
    ? target === "training"
      ? preview.alreadyExists
      : Boolean(preview.alreadyExistsAttempt)
    : false;
  const existsInOtherTarget = preview
    ? target === "training"
      ? Boolean(preview.alreadyExistsAttempt)
      : preview.alreadyExists
    : false;

  if (item.saveStatus === "saving") {
    return {
      uiState: "saving",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: false,
      blockingReason: null,
    };
  }

  if (item.saveStatus === "saved" || item.saveStatus === "updated") {
    return {
      uiState: item.saveStatus,
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: false,
      blockingReason: null,
    };
  }

  if (item.parseStatus !== "ready" || !preview) {
    return {
      uiState: item.parseStatus,
      needsFallbackInputs: false,
      missingRequiredMetrics: false,
      effectiveMetrics: null,
      tafWindow: null,
      tafOutOfBounds: false,
      existsInActiveTarget: false,
      existsInOtherTarget: false,
      canSaveInBatch: false,
      blockingReason: item.parseError ?? null,
    };
  }

  if (item.saveStatus === "save_error") {
    return {
      uiState: "save_error",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: true,
      blockingReason: item.saveError ?? "Erro ao salvar item.",
    };
  }

  if (item.saveStatus === "skipped") {
    return {
      uiState: "skipped",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: false,
      blockingReason: item.skipReason ?? null,
    };
  }

  if (item.isDuplicateInBatch) {
    return {
      uiState: "duplicate_in_batch",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: false,
      blockingReason: "Atividade repetida neste lote.",
    };
  }

  if (target === "training") {
    const outOfTrainingBounds =
      !effectiveMetrics ||
      effectiveMetrics.distanceKm < TRAINING_MIN_DISTANCE_KM ||
      effectiveMetrics.distanceKm > TRAINING_MAX_DISTANCE_KM ||
      effectiveMetrics.durationSeconds < TRAINING_MIN_DURATION_SEC ||
      effectiveMetrics.durationSeconds > TRAINING_MAX_DURATION_SEC;

    if (outOfTrainingBounds) {
      return {
        uiState: "needs_manual_fallback",
        needsFallbackInputs,
        missingRequiredMetrics: true,
        effectiveMetrics,
        tafWindow: null,
        tafOutOfBounds: false,
        existsInActiveTarget,
        existsInOtherTarget,
        canSaveInBatch: false,
        blockingReason: needsFallbackInputs
          ? "Informe data, distância (0,05–100 km) e duração (30s–24h) válidas."
          : "Distância ou duração do arquivo fora dos limites aceitos (0,05–100 km e 30s–24h).",
      };
    }
  } else {
    if (!tafWindow) {
      return {
        uiState: "needs_manual_fallback",
        needsFallbackInputs: true,
        missingRequiredMetrics: true,
        effectiveMetrics,
        tafWindow: null,
        tafOutOfBounds: false,
        existsInActiveTarget,
        existsInOtherTarget,
        canSaveInBatch: false,
        blockingReason:
          "Informe distância e duração válidas para extrair a janela TAF.",
      };
    }

    if (isTafWindowOutOfBounds(tafWindow)) {
      return {
        uiState: "taf_out_of_bounds",
        needsFallbackInputs,
        missingRequiredMetrics: false,
        effectiveMetrics,
        tafWindow,
        tafOutOfBounds: true,
        existsInActiveTarget,
        existsInOtherTarget,
        canSaveInBatch: false,
        blockingReason:
          "Janela TAF fora dos limites aceitos (100 m – 10.000 m e 30s – 7.200s).",
      };
    }
  }

  if (existsInActiveTarget && duplicatePolicy === "skip") {
    return {
      uiState: "duplicate_target_skip",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: false,
      blockingReason:
        target === "training"
          ? "Treino já importado anteriormente no Diário."
          : "Simulado já importado anteriormente.",
    };
  }

  if (existsInActiveTarget && duplicatePolicy === "update") {
    return {
      uiState: "duplicate_target_update",
      needsFallbackInputs,
      missingRequiredMetrics: false,
      effectiveMetrics,
      tafWindow,
      tafOutOfBounds: false,
      existsInActiveTarget,
      existsInOtherTarget,
      canSaveInBatch: true,
      blockingReason: null,
    };
  }

  return {
    uiState: "ready",
    needsFallbackInputs,
    missingRequiredMetrics: false,
    effectiveMetrics,
    tafWindow,
    tafOutOfBounds: false,
    existsInActiveTarget,
    existsInOtherTarget,
    canSaveInBatch: true,
    blockingReason: null,
  };
}

/**
 * Sugere o local padrão de Simulado TAF conforme detecção indoor/esteira do arquivo.
 */
export function resolveDefaultBatchLocationType(
  preview: Pick<ActivityParsePreview, "isIndoor">
): LocationType {
  return preview.isIndoor ? "esteira" : "pista_400m";
}

/**
 * Valida e normaliza o peso corporal (30 a 250 kg) usado no cálculo de calorias MET 2024.
 */
export function validateTrainingWeightKg(
  rawWeight?: string | number | null
): WeightValidationResult {
  if (rawWeight === null || rawWeight === undefined) {
    return { valid: true, weightKg: null };
  }

  if (typeof rawWeight === "string" && rawWeight.trim() === "") {
    return { valid: true, weightKg: null };
  }

  const numeric = parsePositiveNumberInput(rawWeight);
  if (
    !Number.isFinite(numeric) ||
    numeric < MIN_BODY_WEIGHT_KG ||
    numeric > MAX_BODY_WEIGHT_KG
  ) {
    return {
      valid: false,
      weightKg: null,
      error:
        "Informe um peso corporal válido entre 30 kg e 250 kg (ou deixe em branco).",
    };
  }

  return {
    valid: true,
    weightKg: Number(numeric.toFixed(1)),
  };
}

/**
 * Calcula distância, duração, velocidade e pace efetivos considerando fallbacks manuais.
 */
export function resolveEffectivePreviewMetrics(
  preview: Pick<
    ActivityParsePreview,
    "distanceKm" | "durationSeconds" | "speedKmh" | "paceSeconds" | "paceFormatted"
  >,
  fallbackDistanceKm?: string | number,
  fallbackDurationSec?: string | number
): EffectivePreviewMetrics | null {
  const rawDist =
    preview.distanceKm > 0
      ? preview.distanceKm
      : parsePositiveNumberInput(fallbackDistanceKm);
  const rawDur =
    preview.durationSeconds > 0
      ? preview.durationSeconds
      : Math.round(parsePositiveNumberInput(fallbackDurationSec));

  if (
    !Number.isFinite(rawDist) ||
    rawDist <= 0 ||
    !Number.isFinite(rawDur) ||
    rawDur <= 0
  ) {
    return null;
  }

  if (
    preview.distanceKm > 0 &&
    preview.durationSeconds > 0 &&
    preview.speedKmh > 0 &&
    preview.paceSeconds > 0
  ) {
    return {
      distanceKm: preview.distanceKm,
      durationSeconds: preview.durationSeconds,
      speedKmh: preview.speedKmh,
      paceSeconds: preview.paceSeconds,
      paceFormatted: preview.paceFormatted,
    };
  }

  const calc = calcPaceFromDistanceAndTime(rawDist, rawDur);
  return {
    distanceKm: Number(rawDist.toFixed(3)),
    durationSeconds: Math.round(rawDur),
    speedKmh: Number(calc.speedKmh.toFixed(2)),
    paceSeconds: Math.round(calc.paceSeconds),
    paceFormatted: calc.paceFormatted,
  };
}

/**
 * Resolve a janela de 12 min para Simulado TAF (priorizando a janela real extraída do arquivo).
 */
export function computeFallbackTafWindow(
  preview: ActivityParsePreview,
  fallbackDistanceKm?: string | number,
  fallbackDurationSec?: string | number
): TafWindowSummary | null {
  if (preview.tafWindow) return preview.tafWindow;

  const effectiveMetrics = resolveEffectivePreviewMetrics(
    preview,
    fallbackDistanceKm,
    fallbackDurationSec
  );
  if (!effectiveMetrics) return null;

  const rawDuration = effectiveMetrics.durationSeconds;
  const actualDurationSeconds = Math.min(TAF_TARGET_DURATION_SEC, rawDuration);
  const ratio =
    rawDuration > TAF_TARGET_DURATION_SEC
      ? TAF_TARGET_DURATION_SEC / rawDuration
      : 1;
  const distanceMeters = Math.round(effectiveMetrics.distanceKm * 1000 * ratio);
  if (distanceMeters <= 0 || actualDurationSeconds <= 0) return null;

  const paceCalc = calcPaceFromDistanceAndTime(
    distanceMeters / 1000,
    actualDurationSeconds
  );

  return {
    targetDurationSeconds: TAF_TARGET_DURATION_SEC,
    actualDurationSeconds,
    distanceMeters,
    speedKmh: Number(paceCalc.speedKmh.toFixed(2)),
    paceSeconds: Math.round(paceCalc.paceSeconds),
    paceFormatted: paceCalc.paceFormatted,
    avgHeartRate: preview.avgHeartRate,
    maxHeartRate: preview.maxHeartRate,
    windowStartOffsetSeconds: 0,
    windowEndOffsetSeconds: actualDurationSeconds,
    isShorterThanTarget: actualDurationSeconds < TAF_TARGET_DURATION_SEC - 5,
    laps: [],
  };
}

/**
 * Indica se a janela TAF viola os limites aceitos pelo contrato Zod do backend.
 */
export function isTafWindowOutOfBounds(
  tafWindow?: TafWindowSummary | null
): boolean {
  if (!tafWindow) return false;
  return (
    tafWindow.distanceMeters < TAF_MIN_DISTANCE_METERS ||
    tafWindow.distanceMeters > TAF_MAX_DISTANCE_METERS ||
    tafWindow.actualDurationSeconds < TAF_MIN_DURATION_SEC ||
    tafWindow.actualDurationSeconds > TAF_MAX_DURATION_SEC
  );
}

/**
 * Monta o bloco calórico priorizando Compêndio 2024 quando há peso corporal válido,
 * com fallback para calorias ativas do dispositivo `.FIT`.
 */
export function resolveTrainingCaloriesPayload(params: {
  preview: Pick<ActivityParsePreview, "activeCalories">;
  activityType: ActivityType;
  speedKmh: number;
  distanceKm: number;
  durationSeconds: number;
  weightKg: number | null;
}): CaloriePersistencePayload {
  const { preview, activityType, speedKmh, distanceKm, durationSeconds, weightKg } =
    params;

  if (weightKg !== null && Number.isFinite(weightKg) && weightKg > 0) {
    try {
      const estimate = estimateTrainingCalories({
        activityType,
        speedKmh,
        distanceKm,
        durationSeconds,
        weightKg,
      });
      return buildCaloriePayload(estimate);
    } catch {
      // Cai defensivamente para o fallback do dispositivo se houver erro numérico inesperado
    }
  }

  if (preview.activeCalories !== null && preview.activeCalories > 0) {
    return {
      activeCalories: preview.activeCalories,
      totalCalories: preview.activeCalories,
      metValue: null,
      calorieMethod: "garmin_fit_device",
      calorieSource: "device_fit",
      calorieMetadata: {
        compendiumCode: "device_fit",
        activityDescription: "fit_session_total_calories",
        version: "fit_device",
      },
    };
  }

  return EMPTY_CALORIE_PAYLOAD;
}

function sanitizeHeartRatePair(
  rawAvgHr: number | null | undefined,
  rawMaxHr: number | null | undefined
): { avgHeartRate: number | null; maxHeartRate: number | null } {
  const avgHeartRate =
    typeof rawAvgHr === "number" &&
    Number.isFinite(rawAvgHr) &&
    rawAvgHr >= 30 &&
    rawAvgHr <= 250
      ? Math.round(rawAvgHr)
      : null;
  const maxHrCandidate =
    typeof rawMaxHr === "number" &&
    Number.isFinite(rawMaxHr) &&
    rawMaxHr >= 30 &&
    rawMaxHr <= 250
      ? Math.round(rawMaxHr)
      : null;
  const maxHeartRate =
    maxHrCandidate !== null && avgHeartRate !== null && maxHrCandidate < avgHeartRate
      ? avgHeartRate
      : maxHrCandidate;

  return { avgHeartRate, maxHeartRate };
}

function sanitizeOptionalCadence(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded >= 30 && rounded <= 300 ? rounded : null;
}

function sanitizeOptionalElevationGain(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw >= 0 && raw <= 10000 ? Math.round(raw) : null;
}

function sanitizeOptionalShoeName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 100) : null;
}

function sanitizeOptionalPerceivedEffort(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
}

/**
 * Valida limites de Treino do Diário e constrói o payload pronto para `POST /api/taf/trainings`.
 */
export function buildTrainingSessionFromPreview(
  params: BuildTrainingSessionParams
):
  | { ok: true; payload: TrainingSession & { onDuplicate?: "update" } }
  | { ok: false; error: string } {
  const {
    preview,
    activityType,
    workoutTitle = "",
    notes = "",
    shoeName = "",
    perceivedEffort = null,
    bodyWeightKg,
    fallbackDate = "",
    fallbackDistanceKm,
    fallbackDurationSec,
    onDuplicate,
    existingTrainingId,
  } = params;

  const weightValidation = validateTrainingWeightKg(bodyWeightKg);
  if (!weightValidation.valid) {
    return { ok: false, error: weightValidation.error! };
  }

  const finalDistanceKm =
    preview.distanceKm > 0
      ? preview.distanceKm
      : parsePositiveNumberInput(fallbackDistanceKm);
  const finalDurationSeconds =
    preview.durationSeconds > 0
      ? preview.durationSeconds
      : Math.round(parsePositiveNumberInput(fallbackDurationSec));

  if (
    !Number.isFinite(finalDistanceKm) ||
    finalDistanceKm < TRAINING_MIN_DISTANCE_KM ||
    finalDistanceKm > TRAINING_MAX_DISTANCE_KM
  ) {
    return {
      ok: false,
      error: "A distância do treino deve estar entre 0,05 km (50 m) e 100 km.",
    };
  }

  if (
    !Number.isFinite(finalDurationSeconds) ||
    finalDurationSeconds < TRAINING_MIN_DURATION_SEC ||
    finalDurationSeconds > TRAINING_MAX_DURATION_SEC
  ) {
    return {
      ok: false,
      error: "A duração do treino deve estar entre 30 segundos e 24 horas.",
    };
  }

  const paceMetrics = resolveEffectivePreviewMetrics(
    preview,
    finalDistanceKm,
    finalDurationSeconds
  );
  if (!paceMetrics) {
    return {
      ok: false,
      error: "Não foi possível calcular o pace/velocidade do treino.",
    };
  }

  const finalElapsedSeconds =
    preview.elapsedSeconds != null && Number.isFinite(preview.elapsedSeconds)
      ? Math.min(
          TRAINING_MAX_DURATION_SEC,
          Math.max(paceMetrics.durationSeconds, Math.round(preview.elapsedSeconds))
        )
      : null;

  const calorieFields = resolveTrainingCaloriesPayload({
    preview,
    activityType,
    speedKmh: paceMetrics.speedKmh,
    distanceKm: paceMetrics.distanceKm,
    durationSeconds: paceMetrics.durationSeconds,
    weightKg: weightValidation.weightKg,
  });

  // Mantém estrutura leve no fallback de dispositivo (.FIT) compatível com payload esperado pelo backend
  const rawCalorieFields =
    calorieFields.calorieMethod === "garmin_fit_device"
      ? {
          ...calorieFields,
          calorieMetadata: { source: "fit_session_total_calories" },
        }
      : calorieFields;

  // Zod exige calorias estritamente positivas (> 0) quando não nulas
  const hasPositiveCalories =
    rawCalorieFields.activeCalories !== null && rawCalorieFields.activeCalories > 0;
  const finalCalorieFields = hasPositiveCalories
    ? rawCalorieFields
    : EMPTY_CALORIE_PAYLOAD;

  const { avgHeartRate, maxHeartRate } = sanitizeHeartRatePair(
    preview.avgHeartRate,
    preview.maxHeartRate
  );

  const targetId =
    onDuplicate === "update" && (existingTrainingId || preview.existingTrainingId)
      ? (existingTrainingId ?? preview.existingTrainingId)!
      : generateClientRecordId("trn");

  const nowIso = new Date().toISOString();

  return {
    ok: true,
    payload: {
      id: targetId,
      source: preview.source,
      externalId: preview.externalId,
      sessionDate: resolveSafeIsoDate(preview.startedAt, fallbackDate),
      activityType,
      distanceKm: paceMetrics.distanceKm,
      durationSeconds: paceMetrics.durationSeconds,
      elapsedSeconds: finalElapsedSeconds,
      speedKmh: paceMetrics.speedKmh,
      paceSeconds: paceMetrics.paceSeconds,
      paceFormatted: paceMetrics.paceFormatted,
      avgHeartRate,
      maxHeartRate,
      elevationGainM: sanitizeOptionalElevationGain(preview.elevationGainM),
      avgCadence: sanitizeOptionalCadence(preview.avgCadence),
      shoeName: sanitizeOptionalShoeName(shoeName),
      perceivedEffort: sanitizeOptionalPerceivedEffort(perceivedEffort),
      bodyWeightKg: weightValidation.weightKg,
      notes: combineTitleAndNotes(workoutTitle, notes),
      splits: preview.splits,
      ...finalCalorieFields,
      ...(onDuplicate === "update" ? { onDuplicate: "update" as const } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

/**
 * Valida limites de Simulado TAF e constrói o payload pronto para `POST /api/taf/attempts`.
 */
export function buildTafAttemptFromPreview(
  params: BuildTafAttemptParams
):
  | {
      ok: true;
      payload: TafAttempt & { onDuplicate?: "update" };
      tafWindow: TafWindowSummary;
    }
  | { ok: false; error: string } {
  const {
    preview,
    locationType,
    workoutTitle = "",
    notes = "",
    shoeName = "",
    fallbackDate = "",
    fallbackDistanceKm,
    fallbackDurationSec,
    onDuplicate,
    existingAttemptId,
  } = params;

  const effectiveTafWindow = computeFallbackTafWindow(
    preview,
    fallbackDistanceKm,
    fallbackDurationSec
  );

  if (!effectiveTafWindow) {
    return {
      ok: false,
      error: "Não há dados suficientes de distância/duração para o Simulado TAF.",
    };
  }

  const distanceMeters = Math.round(effectiveTafWindow.distanceMeters);
  const actualDurationSeconds = Math.round(
    effectiveTafWindow.actualDurationSeconds
  );

  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < TAF_MIN_DISTANCE_METERS ||
    distanceMeters > TAF_MAX_DISTANCE_METERS
  ) {
    return {
      ok: false,
      error:
        "Para salvar como Simulado TAF, a distância na janela deve estar entre 100 m e 10.000 m.",
    };
  }

  if (
    !Number.isFinite(actualDurationSeconds) ||
    actualDurationSeconds < TAF_MIN_DURATION_SEC ||
    actualDurationSeconds > TAF_MAX_DURATION_SEC
  ) {
    return {
      ok: false,
      error:
        "Para salvar como Simulado TAF, a duração da janela deve estar entre 30 segundos e 2 horas (7.200s).",
    };
  }

  const { avgHeartRate, maxHeartRate } = sanitizeHeartRatePair(
    effectiveTafWindow.avgHeartRate ?? preview.avgHeartRate,
    effectiveTafWindow.maxHeartRate ?? preview.maxHeartRate
  );

  const targetId =
    onDuplicate === "update" && (existingAttemptId || preview.existingAttemptId)
      ? (existingAttemptId ?? preview.existingAttemptId)!
      : generateClientRecordId("att");

  const nowIso = new Date().toISOString();

  return {
    ok: true,
    tafWindow: effectiveTafWindow,
    payload: {
      id: targetId,
      source: preview.source,
      externalId: preview.externalId,
      testDate: resolveSafeIsoDate(preview.startedAt, fallbackDate),
      targetDurationSeconds: TAF_TARGET_DURATION_SEC,
      actualDurationSeconds,
      distanceMeters,
      speedKmh: effectiveTafWindow.speedKmh,
      paceSeconds: effectiveTafWindow.paceSeconds,
      paceFormatted: effectiveTafWindow.paceFormatted,
      locationType,
      shoeName: sanitizeOptionalShoeName(shoeName),
      avgHeartRate,
      maxHeartRate,
      notes: combineTitleAndNotes(workoutTitle, notes),
      laps: effectiveTafWindow.laps,
      ...(onDuplicate === "update" ? { onDuplicate: "update" as const } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

/**
 * Constrói o espelhamento seguro de Simulado TAF → Diário evitando criação de cópias órfãs:
 * - Se já existir treino vinculado no Diário (`preview.alreadyExists`):
 *   - Política `"skip"`: pula o espelho sem criar registro órfão sem `externalId`.
 *   - Política `"update"`: atualiza o registro vinculado via `externalId` + `onDuplicate: "update"`.
 */
export function buildSafeMirroredDiaryPayload(params: {
  attempt: TafAttempt;
  preview: ActivityParsePreview;
  duplicatePolicy: BatchDuplicatePolicy;
}): {
  action: "create" | "update" | "skip";
  payload?: TrainingSession & { onDuplicate?: "update" };
} {
  const { attempt, preview, duplicatePolicy } = params;

  if (preview.alreadyExists && duplicatePolicy === "skip") {
    return { action: "skip" };
  }

  const isSameDurationWindow =
    preview.durationSeconds > 0 &&
    Math.abs(preview.durationSeconds - attempt.actualDurationSeconds) <= 10;
  const hasDeviceCalories =
    isSameDurationWindow &&
    preview.activeCalories !== null &&
    preview.activeCalories > 0;

  const baseMirrored = buildMirroredTrainingFromAttempt({
    attempt,
    source: preview.source,
    externalId: preview.externalId,
    activeCalories: hasDeviceCalories ? preview.activeCalories : null,
    calorieMethod: hasDeviceCalories ? "garmin_fit_device" : null,
    calorieSource: hasDeviceCalories ? "device_fit" : null,
    calorieMetadata: hasDeviceCalories
      ? { source: "fit_session_total_calories" }
      : null,
  });

  if (preview.alreadyExists && duplicatePolicy === "update") {
    return {
      action: "update",
      payload: {
        ...baseMirrored,
        id: preview.existingTrainingId || baseMirrored.id,
        onDuplicate: "update",
      },
    };
  }

  return {
    action: "create",
    payload: baseMirrored,
  };
}

/**
 * Executa um lote de tarefas assíncronas com concorrência máxima fixa e suporte a `AbortSignal`.
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number, signal?: AbortSignal) => Promise<R>,
  signal?: AbortSignal
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length).fill(undefined);
  if (items.length === 0 || signal?.aborted) {
    return results;
  }

  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (signal?.aborted) return;
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex, signal);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Converte grupos gerados por `groupActivityFilesForBatch` em itens editáveis de fila aguardando análise.
 */
export function createPendingBatchItems(
  groups: readonly BatchActivityGroup[],
  defaults: BatchQueueDefaults = {}
): BatchQueueItem[] {
  const defaultActivity: ActivityType =
    defaults.activityTypeOverride && defaults.activityTypeOverride !== "auto"
      ? defaults.activityTypeOverride
      : "corrida_continua";
  const defaultLocation: LocationType =
    defaults.locationTypeOverride && defaults.locationTypeOverride !== "auto"
      ? defaults.locationTypeOverride
      : "pista_400m";

  return groups.map((group) => ({
    ...group,
    parseStatus: "pending",
    parseError: null,
    preview: null,
    workoutTitle: group.defaultTitle,
    activityType: defaultActivity,
    locationType: defaultLocation,
    shoeName: defaults.defaultShoeName?.trim() ?? "",
    perceivedEffort: defaults.defaultPerceivedEffort ?? null,
    notes: "",
    fallbackDate: "",
    fallbackDistanceKm: "",
    fallbackDurationSec: "",
    isDuplicateInBatch: false,
    duplicateOfItemId: null,
    saveStatus: "idle",
    saveError: null,
    skipReason: null,
    savedTraining: null,
    savedAttempt: null,
    mirrorStatus: "idle",
    mirrorError: null,
  }));
}

/**
 * Executa o parsing remoto de cada grupo da fila com concorrência controlada (padrão: 3),
 * isolando erros individuais e detectando duplicidades intra-lote de `externalId`.
 */
export async function analyzeBatchActivityGroups(
  items: readonly BatchQueueItem[],
  parseActivityFn: (
    files: File[],
    signal?: AbortSignal
  ) => Promise<ActivityParsePreview>,
  options: AnalyzeBatchOptions = {}
): Promise<{ items: BatchQueueItem[]; aborted: boolean }> {
  const {
    concurrency = 3,
    signal,
    activityTypeOverride = "auto",
    locationTypeOverride = "auto",
    defaultShoeName,
    defaultPerceivedEffort,
    onProgress,
  } = options;

  const working: BatchQueueItem[] = items.map((item) => ({ ...item }));
  const targetIndices = working
    .map((item, idx) =>
      item.parseStatus === "pending" ||
      item.parseStatus === "parse_error" ||
      item.parseStatus === "cancelled"
        ? idx
        : -1
    )
    .filter((idx) => idx !== -1);

  let completedCount = 0;

  await runPool(
    targetIndices,
    concurrency,
    async (itemIdx) => {
      const current = working[itemIdx];
      working[itemIdx] = {
        ...current,
        parseStatus: "parsing",
        parseError: null,
      };

      try {
        const preview = await parseActivityFn(current.files, signal);
        const currentTrimmed = current.workoutTitle.trim();
        const hasManualTitleEdit =
          currentTrimmed.length > 0 && currentTrimmed !== current.defaultTitle.trim();
        const resolvedTitle = hasManualTitleEdit
          ? currentTrimmed
          : preview.name?.trim() ||
            preview.suggestedNotes?.trim() ||
            current.defaultTitle ||
            "";
        const resolvedActivityType: ActivityType =
          activityTypeOverride !== "auto"
            ? activityTypeOverride
            : resolveDefaultActivityTypeFromPreview(
                preview,
                current.files.map((file) => file.name)
              );
        const resolvedLocationType: LocationType =
          locationTypeOverride !== "auto"
            ? locationTypeOverride
            : resolveDefaultBatchLocationType(preview);

        working[itemIdx] = {
          ...working[itemIdx],
          parseStatus: "ready",
          parseError: null,
          preview,
          workoutTitle: resolvedTitle,
          activityType: resolvedActivityType,
          locationType: resolvedLocationType,
          shoeName:
            working[itemIdx].shoeName || defaultShoeName?.trim() || "",
          perceivedEffort:
            working[itemIdx].perceivedEffort ?? defaultPerceivedEffort ?? null,
          fallbackDate:
            working[itemIdx].fallbackDate ||
            (preview.startedAt ? preview.startedAt.slice(0, 16) : ""),
          fallbackDistanceKm:
            working[itemIdx].fallbackDistanceKm ||
            (preview.distanceKm > 0 ? String(preview.distanceKm) : ""),
          fallbackDurationSec:
            working[itemIdx].fallbackDurationSec ||
            (preview.durationSeconds > 0 ? String(preview.durationSeconds) : ""),
        };
      } catch (err) {
        const isAbort =
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError");
        working[itemIdx] = {
          ...working[itemIdx],
          parseStatus: isAbort ? "cancelled" : "parse_error",
          parseError: isAbort
            ? "Análise cancelada."
            : err instanceof Error && err.message.trim().length > 0
              ? err.message
              : "Erro ao processar arquivo de atividade.",
        };
      }

      completedCount += 1;
      onProgress?.({
        completed: completedCount,
        total: targetIndices.length,
        item: working[itemIdx],
      });
      return working[itemIdx];
    },
    signal
  );

  if (signal?.aborted) {
    for (const idx of targetIndices) {
      if (working[idx].parseStatus === "pending" || working[idx].parseStatus === "parsing") {
        working[idx] = {
          ...working[idx],
          parseStatus: "cancelled",
          parseError: "Análise cancelada.",
        };
      }
    }
  }

  return {
    items: markDuplicateExternalIdsInBatch(working),
    aborted: Boolean(signal?.aborted),
  };
}

async function runSingleBatchSaveItem(params: {
  item: BatchQueueItem;
  config: PersistBatchConfig;
  weightKgOverride: string | number | null | undefined;
  deps: PersistBatchDependencies;
  seenMirroredExternalIds: Set<string>;
}): Promise<BatchQueueItem> {
  const { item, config, weightKgOverride, deps, seenMirroredExternalIds } = params;
  const preview = item.preview!;

  if (config.target === "training") {
    const built = buildTrainingSessionFromPreview({
      preview,
      activityType: item.activityType,
      workoutTitle: item.workoutTitle,
      notes: item.notes,
      shoeName: item.shoeName,
      perceivedEffort: item.perceivedEffort,
      bodyWeightKg: weightKgOverride,
      fallbackDate: item.fallbackDate,
      fallbackDistanceKm: item.fallbackDistanceKm,
      fallbackDurationSec: item.fallbackDurationSec,
      onDuplicate:
        preview.alreadyExists && config.duplicatePolicy === "update"
          ? "update"
          : undefined,
      existingTrainingId: preview.existingTrainingId,
    });

    if (!built.ok) {
      return {
        ...item,
        saveStatus: "save_error",
        saveError: built.error,
      };
    }

    const isUpdate =
      preview.alreadyExists && config.duplicatePolicy === "update";

    try {
      const saved = await deps.saveTraining(built.payload, false, {
        skipSheetsSync: true,
      });
      return {
        ...item,
        saveStatus: isUpdate ? "updated" : "saved",
        saveError: null,
        skipReason: null,
        mirrorStatus: "idle",
        mirrorError: null,
        savedTraining: saved,
        preview: {
          ...preview,
          alreadyExists: true,
          existingTrainingId: saved.id,
        },
      };
    } catch (err) {
      return {
        ...item,
        saveStatus: "save_error",
        saveError:
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Erro ao salvar treino.",
        mirrorStatus: "idle",
        mirrorError: null,
      };
    }
  }

  // Modo Simulado TAF
  const builtAttempt = buildTafAttemptFromPreview({
    preview,
    locationType: item.locationType,
    workoutTitle: item.workoutTitle,
    notes: item.notes,
    shoeName: item.shoeName,
    fallbackDate: item.fallbackDate,
    fallbackDistanceKm: item.fallbackDistanceKm,
    fallbackDurationSec: item.fallbackDurationSec,
    onDuplicate:
      preview.alreadyExistsAttempt && config.duplicatePolicy === "update"
        ? "update"
        : undefined,
    existingAttemptId: preview.existingAttemptId,
  });

  if (!builtAttempt.ok) {
    return {
      ...item,
      saveStatus: "save_error",
      saveError: builtAttempt.error,
    };
  }

  const isAttemptUpdate =
    Boolean(preview.alreadyExistsAttempt) && config.duplicatePolicy === "update";

  let savedAttempt: TafAttempt;
  try {
    savedAttempt = await deps.saveAttempt(builtAttempt.payload, false, {
      skipSheetsSync: true,
    });
  } catch (err) {
    return {
      ...item,
      saveStatus: "save_error",
      saveError:
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Erro ao salvar simulado TAF.",
    };
  }

  let mirrorStatus: BatchMirrorStatus = "idle";
  let mirrorError: string | null = null;
  let updatedPreview: ActivityParsePreview = {
    ...preview,
    alreadyExistsAttempt: true,
    existingAttemptId: savedAttempt.id,
  };
  let savedMirroredTraining: TrainingSession | null = item.savedTraining;

  if (config.alsoSaveToDiary) {
    const extId = preview.externalId?.trim() ?? "";
    const alreadyMirroredInBatch =
      extId.length > 0 && seenMirroredExternalIds.has(extId);

    if (alreadyMirroredInBatch) {
      mirrorStatus = "skipped";
    } else {
      if (extId) seenMirroredExternalIds.add(extId);

      const mirrorPlan = buildSafeMirroredDiaryPayload({
        attempt: savedAttempt,
        preview: updatedPreview,
        duplicatePolicy: config.duplicatePolicy,
      });

      if (mirrorPlan.action === "skip" || !mirrorPlan.payload) {
        mirrorStatus = "skipped";
      } else {
        try {
          const savedMirror = await deps.saveTraining(
            mirrorPlan.payload,
            false,
            { skipSheetsSync: true }
          );
          savedMirroredTraining = savedMirror;
          mirrorStatus = mirrorPlan.action === "update" ? "updated" : "saved";
          updatedPreview = {
            ...updatedPreview,
            alreadyExists: true,
            existingTrainingId: savedMirror.id,
          };
        } catch (mirrorErr) {
          mirrorStatus = "error";
          mirrorError =
            mirrorErr instanceof Error && mirrorErr.message.trim().length > 0
              ? mirrorErr.message
              : "Simulado salvo, mas falhou ao espelhar no Diário.";
        }
      }
    }
  }

  return {
    ...item,
    saveStatus: isAttemptUpdate ? "updated" : "saved",
    saveError: null,
    skipReason: null,
    savedAttempt,
    savedTraining: savedMirroredTraining,
    mirrorStatus,
    mirrorError,
    preview: updatedPreview,
  };
}

/**
 * Executa a gravação em lote com concorrência controlada (padrão: 2), respeita políticas
 * de duplicados no destino e no próprio lote, passa `{ skipSheetsSync: true }` em todos
 * os registros e consolida em 1 único push final para Google Sheets quando configurado.
 */
export async function persistBatchActivityItems(
  items: readonly BatchQueueItem[],
  config: PersistBatchConfig,
  deps: PersistBatchDependencies,
  options: PersistBatchOptions = {}
): Promise<{ items: BatchQueueItem[]; summary: BatchImportSummary }> {
  const { signal, onProgress } = options;
  const working = markDuplicateExternalIdsInBatch(items).map((item) => ({
    ...item,
  }));

  const targetIndices: number[] = [];

  for (let i = 0; i < working.length; i++) {
    const item = working[i];

    // Preserva itens já gravados anteriormente para suportar "Tentar novamente falhos"
    if (item.saveStatus === "saved" || item.saveStatus === "updated") {
      continue;
    }

    if (item.parseStatus !== "ready" || !item.preview) {
      continue;
    }

    // Reavalia elegibilidade limpa para suportar reexecuções após troca de política/destino ou fallback
    const eligibility = evaluateBatchItemEligibility(
      { ...item, saveStatus: "idle", skipReason: null, saveError: null },
      config.target,
      config.duplicatePolicy
    );

    if (
      eligibility.uiState === "duplicate_in_batch" ||
      eligibility.uiState === "duplicate_target_skip" ||
      eligibility.uiState === "needs_manual_fallback" ||
      eligibility.uiState === "taf_out_of_bounds"
    ) {
      working[i] = {
        ...item,
        saveStatus: "skipped",
        skipReason: eligibility.blockingReason,
        saveError: null,
        mirrorStatus: "idle",
        mirrorError: null,
      };
      continue;
    }

    targetIndices.push(i);
  }

  const seenMirroredExternalIds = new Set<string>();
  let completed = 0;
  let newlyPersistedInRun = 0;

  await runPool(
    targetIndices,
    config.concurrency ?? 2,
    async (itemIdx) => {
      const updatedItem = await runSingleBatchSaveItem({
        item: working[itemIdx],
        config,
        weightKgOverride: config.bodyWeightKg,
        deps,
        seenMirroredExternalIds,
      });

      if (updatedItem.saveStatus === "saved" || updatedItem.saveStatus === "updated") {
        newlyPersistedInRun += 1;
      }
      if (
        updatedItem.mirrorStatus === "saved" ||
        updatedItem.mirrorStatus === "updated"
      ) {
        newlyPersistedInRun += 1;
      }

      working[itemIdx] = updatedItem;
      completed += 1;
      onProgress?.({
        completed,
        total: targetIndices.length,
        item: updatedItem,
      });
      return updatedItem;
    },
    signal
  );

  let savedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let mirroredCount = 0;
  let mirrorSkippedCount = 0;
  let mirrorFailedCount = 0;

  for (const item of working) {
    if (item.saveStatus === "saved") savedCount++;
    else if (item.saveStatus === "updated") updatedCount++;
    else if (item.saveStatus === "skipped") skippedCount++;
    else if (item.saveStatus === "save_error" || item.parseStatus === "parse_error") {
      failedCount++;
    }

    if (config.target === "taf_attempt") {
      if (item.mirrorStatus === "saved" || item.mirrorStatus === "updated") {
        mirroredCount++;
      } else if (item.mirrorStatus === "skipped") {
        mirrorSkippedCount++;
      } else if (item.mirrorStatus === "error") {
        mirrorFailedCount++;
      }
    }
  }

  let sheetsSynced = false;
  let sheetsSyncWarning: string | null = null;

  if (newlyPersistedInRun > 0 && deps.getSheetsSyncStatus && deps.syncGoogleSheets) {
    try {
      const syncStatus = await deps.getSheetsSyncStatus().catch(() => null);
      if (syncStatus?.configured) {
        await deps.syncGoogleSheets({
          direction: "push",
          forceFullResync: false,
        });
        sheetsSynced = true;
      }
    } catch (syncErr) {
      sheetsSyncWarning =
        syncErr instanceof Error && syncErr.message.trim().length > 0
          ? syncErr.message
          : "Treinos gravados no banco, mas houve falha ao enviar para o Google Sheets.";
    }
  }

  return {
    items: working,
    summary: {
      target: config.target,
      duplicatePolicy: config.duplicatePolicy,
      totalItems: working.length,
      savedCount,
      updatedCount,
      skippedCount,
      failedCount,
      mirroredCount,
      mirrorSkippedCount,
      mirrorFailedCount,
      sheetsSynced,
      sheetsSyncWarning,
      aborted: Boolean(signal?.aborted),
    },
  };
}
