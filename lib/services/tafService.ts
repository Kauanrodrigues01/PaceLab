import {
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  ActivityParsePreview,
  ActivitySource,
  ActivityType,
  LOCATION_LABELS,
  LocationType,
  TafAttempt,
  TrainingSession,
  TafGoalConfig,
  WeeklyPlanData,
} from "@/types";
export type {
  WeeklyPlanAdherenceSummaryDto,
  WeeklyPlanData,
  WeeklyPlanExtraSummaryDto,
  WeeklyPlanItemDto,
  WeeklyPlanRollingAverageDto,
  WeeklyPlanRollingWeekDto,
  WeeklyPlanStatus,
} from "@/types";
import type {
  SheetsSyncOptions,
  SheetsSyncReport,
  SheetsSyncStatus,
} from "@/lib/googleSheets/types";

export interface SaveRecordOptions {
  skipSheetsSync?: boolean;
}

export const DEFAULT_GOAL: TafGoalConfig = {
  institutionName: "Edital Padrão",
  minDistanceMeters: 2400,
  targetDistanceMeters: 2300,
  targetDurationMinutes: 12,
  targetExamDate: null,
  pullupType: "dinamica",
  pullupMinReps: 3,
  pullupTargetReps: 5,
  pullupMinSeconds: null,
  pullupTargetSeconds: null,
  pullupDurationSeconds: null,
  pushupMinReps: 20,
  pushupTargetReps: 30,
  pushupDurationSeconds: null,
  absMinReps: 30,
  absTargetReps: 40,
  absDurationSeconds: null,
};

export interface TafPaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface TrainingPaginationOptions extends TafPaginationOptions {
  activityType?: string;
}

export class TafApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "TafApiError";
    this.status = status;
    this.code = code;
  }
}

const VALID_SOURCES_SET = new Set<string>(ACTIVITY_SOURCES);
const VALID_ACTIVITIES_SET = new Set<string>(ACTIVITY_TYPES);
const VALID_LOCATIONS_SET = new Set<string>(Object.keys(LOCATION_LABELS));
const CSV_FORMULA_PREFIX_REGEX = /^(?:\s*[=+\-@]|[\t\r])/;

function isDuplicateConflictError(err: unknown): boolean {
  if (err instanceof TafApiError && err.status === 409) {
    return true;
  }
  if (err instanceof Error) {
    return /já foi importado|DUPLICATE_EXTERNAL_ID|already exists|\b409\b/i.test(
      err.message
    );
  }
  return false;
}

function normalizeSource(raw: unknown): ActivitySource {
  if (typeof raw === "string" && VALID_SOURCES_SET.has(raw)) {
    return raw as ActivitySource;
  }
  return "manual";
}

function normalizeIsoDate(raw: unknown, fallbackIso: string): string {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsedMs = Date.parse(raw.trim());
    if (Number.isFinite(parsedMs)) {
      return new Date(parsedMs).toISOString();
    }
  }
  return fallbackIso;
}

function sanitizeBoundedInt(
  raw: unknown,
  min: number,
  max: number
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const rounded = Math.round(raw);
  if (rounded < min || rounded > max) {
    return null;
  }
  return rounded;
}

function sanitizeBoundedNumber(
  raw: unknown,
  min: number,
  max: number
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  if (raw < min || raw > max) {
    return null;
  }
  return raw;
}

function sanitizePositiveNumber(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

function normalizeHeartRatePair(
  rawAvg: unknown,
  rawMax: unknown
): { avgHeartRate: number | null; maxHeartRate: number | null } {
  const avgHeartRate = sanitizeBoundedInt(rawAvg, 30, 250);
  let maxHeartRate = sanitizeBoundedInt(rawMax, 30, 250);
  if (
    avgHeartRate !== null &&
    maxHeartRate !== null &&
    maxHeartRate < avgHeartRate
  ) {
    maxHeartRate = avgHeartRate;
  }
  return { avgHeartRate, maxHeartRate };
}

function resolveFallbackPaceMetrics(
  raw: Record<string, unknown>,
  distanceKm: number,
  durationSeconds: number
): { speedKmh: number; paceSeconds: number; paceFormatted: string } {
  const safeDistanceKm = distanceKm > 0 ? distanceKm : 0.05;
  const safeDurationSec = durationSeconds > 0 ? Math.round(durationSeconds) : 30;

  const speedKmh =
    typeof raw.speedKmh === "number" && Number.isFinite(raw.speedKmh) && raw.speedKmh > 0
      ? raw.speedKmh
      : Number((safeDistanceKm / (safeDurationSec / 3600)).toFixed(2));
  const paceSeconds =
    typeof raw.paceSeconds === "number" && Number.isFinite(raw.paceSeconds) && raw.paceSeconds > 0
      ? Math.max(1, Math.round(raw.paceSeconds))
      : Math.max(1, Math.round(safeDurationSec / safeDistanceKm));
  const paceFormatted =
    typeof raw.paceFormatted === "string" && raw.paceFormatted.trim().length > 0
      ? raw.paceFormatted
      : `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`;

  return { speedKmh, paceSeconds, paceFormatted };
}

function normalizeAttemptFromBackup(
  raw: Record<string, unknown>
): TafAttempt {
  const distanceMeters = Math.round(Number(raw.distanceMeters));
  const actualDurationSeconds = Math.round(Number(raw.actualDurationSeconds));
  const pace = resolveFallbackPaceMetrics(
    raw,
    distanceMeters / 1000,
    actualDurationSeconds
  );
  const nowIso = new Date().toISOString();
  const hr = normalizeHeartRatePair(raw.avgHeartRate, raw.maxHeartRate);
  const locationType =
    typeof raw.locationType === "string" && VALID_LOCATIONS_SET.has(raw.locationType)
      ? (raw.locationType as LocationType)
      : null;

  return {
    ...(raw as Partial<TafAttempt>),
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    testDate: normalizeIsoDate(raw.testDate, nowIso),
    targetDurationSeconds:
      sanitizeBoundedInt(raw.targetDurationSeconds, 1, 7200) ?? 720,
    actualDurationSeconds,
    distanceMeters,
    ...pace,
    locationType,
    avgHeartRate: hr.avgHeartRate,
    maxHeartRate: hr.maxHeartRate,
    createdAt: normalizeIsoDate(raw.createdAt, nowIso),
    updatedAt: normalizeIsoDate(raw.updatedAt, nowIso),
    source: normalizeSource(raw.source),
    externalId:
      typeof raw.externalId === "string" && raw.externalId.trim().length > 0
        ? raw.externalId.trim()
        : null,
    syncedToSheetsAt: null,
    laps: Array.isArray(raw.laps) ? (raw.laps as TafAttempt["laps"]) : [],
  };
}

function normalizeTrainingFromBackup(
  raw: Record<string, unknown>
): TrainingSession {
  const distanceKm = Number(raw.distanceKm);
  const durationSeconds = Math.round(Number(raw.durationSeconds));
  const pace = resolveFallbackPaceMetrics(raw, distanceKm, durationSeconds);
  const nowIso = new Date().toISOString();
  const hr = normalizeHeartRatePair(raw.avgHeartRate, raw.maxHeartRate);
  const activityType =
    typeof raw.activityType === "string" && VALID_ACTIVITIES_SET.has(raw.activityType)
      ? (raw.activityType as ActivityType)
      : "corrida_continua";

  let elapsedSeconds = sanitizeBoundedInt(raw.elapsedSeconds, 30, 86400);
  if (elapsedSeconds !== null && elapsedSeconds < durationSeconds) {
    elapsedSeconds = Math.min(86400, durationSeconds);
  }

  return {
    ...(raw as Partial<TrainingSession>),
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    sessionDate: normalizeIsoDate(raw.sessionDate, nowIso),
    activityType,
    distanceKm,
    durationSeconds,
    elapsedSeconds,
    ...pace,
    avgHeartRate: hr.avgHeartRate,
    maxHeartRate: hr.maxHeartRate,
    avgCadence: sanitizeBoundedInt(raw.avgCadence, 30, 300),
    elevationGainM: sanitizeBoundedNumber(raw.elevationGainM, 0, 10000),
    perceivedEffort: sanitizeBoundedInt(raw.perceivedEffort, 1, 10),
    bodyWeightKg: sanitizeBoundedNumber(raw.bodyWeightKg, 30, 250),
    activeCalories: sanitizePositiveNumber(raw.activeCalories),
    totalCalories: sanitizePositiveNumber(raw.totalCalories),
    metValue: sanitizePositiveNumber(raw.metValue),
    createdAt: normalizeIsoDate(raw.createdAt, nowIso),
    updatedAt: normalizeIsoDate(raw.updatedAt, nowIso),
    source: normalizeSource(raw.source),
    externalId:
      typeof raw.externalId === "string" && raw.externalId.trim().length > 0
        ? raw.externalId.trim()
        : null,
    syncedToSheetsAt: null,
    splits: Array.isArray(raw.splits)
      ? (raw.splits as TrainingSession["splits"])
      : [],
  };
}

function sanitizeCsvTextCell(
  value: string | number | null | undefined,
  alwaysQuote = false
): string {
  if (value === null || value === undefined) {
    return alwaysQuote ? '""' : "";
  }
  const rawStr = String(value).replace(/\r\n|\r|\n/g, " ");
  const hasFormulaPrefix = CSV_FORMULA_PREFIX_REGEX.test(rawStr);
  const safeStr = hasFormulaPrefix ? `'${rawStr}` : rawStr;

  if (alwaysQuote || hasFormulaPrefix || /[",]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

function formatCsvNumber(
  value: number | null | undefined,
  decimals?: number
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return typeof decimals === "number" ? value.toFixed(decimals) : String(value);
}

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

interface ApiErrorPayload {
  error?: string;
  details?: Array<{ field?: string; message?: string }> | { code?: unknown };
}

async function extractApiErrorInfo(
  res: Response,
  fallbackMessage: string
): Promise<{ message: string; code?: string }> {
  try {
    const errData = (await res.json().catch(() => ({}))) as ApiErrorPayload;
    const code =
      errData.details &&
      !Array.isArray(errData.details) &&
      typeof errData.details === "object" &&
      typeof (errData.details as { code?: unknown }).code === "string"
        ? (errData.details as { code: string }).code
        : undefined;

    if (Array.isArray(errData.details) && errData.details.length > 0) {
      const messages = errData.details
        .map((d) => d.message)
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) {
        return { message: messages.join("; "), code };
      }
    }

    if (errData.error) {
      return { message: errData.error, code };
    }

    return { message: fallbackMessage, code };
  } catch {
    // Falha silenciosa no parsing, mantém fallback
  }

  return { message: fallbackMessage };
}

async function extractErrorMessage(
  res: Response,
  fallbackMessage: string
): Promise<string> {
  const { message } = await extractApiErrorInfo(res, fallbackMessage);
  return message;
}

// ─── Serviço de Persistência Direta no Supabase (PostgreSQL via Prisma API) ───
export const tafService = {
  // ─── Metas da Prova ────────────────────────────────────────────────────────
  async getGoal(): Promise<TafGoalConfig> {
    try {
      const res = await fetch("/api/taf/goals", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        return unwrapApiResponse<TafGoalConfig>(json);
      }
    } catch {
      // Retorna meta padrão se offline ou falha de rede
    }
    return DEFAULT_GOAL;
  },

  async saveGoal(goal: TafGoalConfig): Promise<TafGoalConfig> {
    const res = await fetch("/api/taf/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao salvar meta no banco de dados"
      );
      throw new Error(message);
    }

    const json = await res.json();
    return unwrapApiResponse<TafGoalConfig>(json);
  },

  // ─── Tentativas de TAF (12 min) ───────────────────────────────────────────
  async getAttempts(options?: TafPaginationOptions): Promise<TafAttempt[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/taf/attempts${qs}`, { cache: "no-store" });
    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao carregar simulados do banco de dados"
      );
      throw new Error(message);
    }
    const json = await res.json();
    return unwrapApiResponse<TafAttempt[]>(json);
  },

  async saveAttempt(
    attempt: TafAttempt,
    isUpdate = false,
    options?: SaveRecordOptions
  ): Promise<TafAttempt> {
    const baseUrl = isUpdate
      ? `/api/taf/attempts/${encodeURIComponent(attempt.id)}`
      : "/api/taf/attempts";
    const url = options?.skipSheetsSync ? `${baseUrl}?skipSheetsSync=true` : baseUrl;
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt),
    });

    if (!res.ok) {
      const { message, code } = await extractApiErrorInfo(
        res,
        "Erro ao salvar simulado no banco de dados"
      );
      throw new TafApiError(message, res.status, code);
    }

    const json = await res.json();
    return unwrapApiResponse<TafAttempt>(json);
  },

  async deleteAttempt(id: string): Promise<boolean> {
    const res = await fetch(`/api/taf/attempts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao excluir simulado no banco de dados"
      );
      throw new Error(message);
    }

    return true;
  },

  // ─── Diário de Treinos ─────────────────────────────────────────────────────
  async getTrainings(options?: TrainingPaginationOptions): Promise<TrainingSession[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.activityType) params.set("activityType", options.activityType);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/taf/trainings${qs}`, { cache: "no-store" });
    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao carregar diário de treinos do banco de dados"
      );
      throw new Error(message);
    }
    const json = await res.json();
    return unwrapApiResponse<TrainingSession[]>(json);
  },

  async getTrainingById(id: string): Promise<TrainingSession> {
    const res = await fetch(`/api/taf/trainings/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const { message, code } = await extractApiErrorInfo(
        res,
        "Erro ao carregar treino no banco de dados"
      );
      throw new TafApiError(message, res.status, code);
    }
    const json = await res.json();
    return unwrapApiResponse<TrainingSession>(json);
  },

  async saveTraining(
    training: TrainingSession,
    isUpdate = false,
    options?: SaveRecordOptions
  ): Promise<TrainingSession> {
    const baseUrl = isUpdate
      ? `/api/taf/trainings/${encodeURIComponent(training.id)}`
      : "/api/taf/trainings";
    const url = options?.skipSheetsSync ? `${baseUrl}?skipSheetsSync=true` : baseUrl;
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(training),
    });

    if (!res.ok) {
      const { message, code } = await extractApiErrorInfo(
        res,
        "Erro ao salvar treino no banco de dados"
      );
      throw new TafApiError(message, res.status, code);
    }

    const json = await res.json();
    return unwrapApiResponse<TrainingSession>(json);
  },

  async deleteTraining(id: string): Promise<boolean> {
    const res = await fetch(`/api/taf/trainings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao excluir treino no banco de dados"
      );
      throw new Error(message);
    }

    return true;
  },

  // ─── Importação / Preview Unificado de Arquivos (.FIT Prioritário + .GPX) ──
  async parseActivity(
    files: File | Blob | Array<File | Blob>,
    options?: { signal?: AbortSignal }
  ): Promise<ActivityParsePreview> {
    const fileList = Array.isArray(files) ? files : [files];
    const formData = new FormData();

    for (const file of fileList) {
      formData.append("files", file);
    }

    const res = await fetch("/api/training-sessions/parse-activity", {
      method: "POST",
      body: formData,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao processar arquivo de atividade (.FIT / .GPX)"
      );
      throw new Error(message);
    }

    const json = await res.json();
    return unwrapApiResponse<ActivityParsePreview>(json);
  },

  async parseGpx(
    file: File | Blob | Array<File | Blob>
  ): Promise<ActivityParsePreview> {
    return this.parseActivity(file);
  },

  // ─── Status do Banco SQL / Prisma ──────────────────────────────────────────
  async checkDatabaseHealth(): Promise<{
    connected: boolean;
    orm: string;
    database?: string;
    latencyMs?: number;
    sheetsConfigured?: boolean;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/taf/health", { cache: "no-store" });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const data = (raw && typeof raw === "object" && "data" in raw && raw.data
        ? raw.data
        : raw) as Record<string, unknown>;
      return {
        connected: res.ok && data?.status === "connected",
        orm: "Prisma",
        database: data?.database as string | undefined,
        latencyMs: data?.latencyMs as number | undefined,
        ...(typeof data?.sheetsConfigured === "boolean"
          ? { sheetsConfigured: data.sheetsConfigured }
          : {}),
        error: (data?.error as string | undefined) || (raw?.error as string | undefined),
      };
    } catch (err) {
      return {
        connected: false,
        orm: "Prisma",
        error: err instanceof Error ? err.message : "Sem conexão de rede com o banco",
      };
    }
  },

  // ─── Sincronização Bidirecional Google Sheets ───────────────────────────────
  async getSheetsSyncStatus(): Promise<SheetsSyncStatus> {
    try {
      const res = await fetch("/api/sync/sheets", { cache: "no-store" });
      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          "Não foi possível consultar o status do Google Sheets"
        );
        return {
          configured: false,
          error: message,
          pendingTrainingsCount: 0,
          pendingAttemptsCount: 0,
          totalPendingCount: 0,
        };
      }
      const json = await res.json();
      const data = unwrapApiResponse<SheetsSyncStatus>(json);
      return {
        configured: Boolean(data?.configured),
        ...(data?.error ? { error: data.error } : {}),
        pendingTrainingsCount: data?.pendingTrainingsCount ?? 0,
        pendingAttemptsCount: data?.pendingAttemptsCount ?? 0,
        totalPendingCount: data?.totalPendingCount ?? 0,
      };
    } catch (err) {
      return {
        configured: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro de rede ao consultar status do Google Sheets",
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      };
    }
  },

  async syncGoogleSheets(options: SheetsSyncOptions = {}): Promise<SheetsSyncReport> {
    const res = await fetch("/api/sync/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: options.direction ?? "bidirectional",
        forceFullResync: Boolean(options.forceFullResync),
      }),
    });

    if (!res.ok) {
      const { message, code } = await extractApiErrorInfo(
        res,
        "Erro ao sincronizar dados com o Google Sheets"
      );
      throw new TafApiError(message, res.status, code);
    }

    const json = await res.json();
    return unwrapApiResponse<SheetsSyncReport>(json);
  },

  // ─── Plano Semanal & Aderência ──────────────────────────────────────────────
  async getWeeklyPlan(weekStart?: string): Promise<WeeklyPlanData> {
    const qs = weekStart
      ? `?weekStart=${encodeURIComponent(weekStart)}`
      : "";
    const res = await fetch(`/api/weekly-plan${qs}`, { cache: "no-store" });

    if (!res.ok) {
      const { message, code } = await extractApiErrorInfo(
        res,
        "Erro ao carregar plano semanal e aderência"
      );
      throw new TafApiError(message, res.status, code);
    }

    const json = await res.json();
    return unwrapApiResponse<WeeklyPlanData>(json);
  },

  // ─── Backup & Exportação (JSON / CSV) ──────────────────────────────────────
  exportBackupJson(
    goal: TafGoalConfig = DEFAULT_GOAL,
    attempts: TafAttempt[] = [],
    trainings: TrainingSession[] = []
  ): string {
    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      appName: "PaceLab",
      goal,
      attempts,
      trainings,
    };

    return JSON.stringify(backup, null, 2);
  },

  async importBackupJson(jsonString: string): Promise<{
    success: boolean;
    attemptsCount: number;
    trainingsCount: number;
    skippedCount?: number;
    failedCount?: number;
    version?: number;
    error?: string;
  }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Arquivo JSON inválido");
      }

      const record = parsed as Record<string, unknown>;
      const hasKnownStructure =
        "goal" in record ||
        Array.isArray(record.attempts) ||
        Array.isArray(record.trainings);

      if (!hasKnownStructure) {
        throw new Error("Formato de backup PaceLab não reconhecido");
      }

      const version =
        typeof record.version === "number" && Number.isFinite(record.version)
          ? record.version
          : 1;

      let attemptsCount = 0;
      let trainingsCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let goalSaved = false;

      if (
        record.goal &&
        typeof record.goal === "object" &&
        !Array.isArray(record.goal)
      ) {
        const savedGoal = await this.saveGoal(record.goal as TafGoalConfig).catch(
          () => null
        );
        goalSaved = Boolean(savedGoal);
      }

      if (Array.isArray(record.attempts)) {
        for (const item of record.attempts) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const att = item as Record<string, unknown>;
          if (
            typeof att.distanceMeters === "number" &&
            att.distanceMeters > 0 &&
            typeof att.actualDurationSeconds === "number" &&
            att.actualDurationSeconds > 0
          ) {
            try {
              await this.saveAttempt(normalizeAttemptFromBackup(att), false, {
                skipSheetsSync: true,
              });
              attemptsCount++;
            } catch (err) {
              if (isDuplicateConflictError(err)) {
                skippedCount++;
              } else {
                failedCount++;
              }
            }
          }
        }
      }

      if (Array.isArray(record.trainings)) {
        for (const item of record.trainings) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const tr = item as Record<string, unknown>;
          if (
            typeof tr.distanceKm === "number" &&
            tr.distanceKm > 0 &&
            typeof tr.durationSeconds === "number" &&
            tr.durationSeconds > 0
          ) {
            try {
              await this.saveTraining(normalizeTrainingFromBackup(tr), false, {
                skipSheetsSync: true,
              });
              trainingsCount++;
            } catch (err) {
              if (isDuplicateConflictError(err)) {
                skippedCount++;
              } else {
                failedCount++;
              }
            }
          }
        }
      }

      if (attemptsCount > 0 || trainingsCount > 0 || goalSaved) {
        const sheetsStatus = await this.getSheetsSyncStatus().catch(() => null);
        if (sheetsStatus?.configured) {
          await this.syncGoogleSheets({
            direction: "push",
            forceFullResync: false,
          }).catch(() => null);
        }
      }

      return {
        success: true,
        attemptsCount,
        trainingsCount,
        skippedCount,
        failedCount,
        version,
      };
    } catch (err) {
      return {
        success: false,
        attemptsCount: 0,
        trainingsCount: 0,
        error: err instanceof Error ? err.message : "Erro ao importar arquivo",
      };
    }
  },

  exportAttemptsCsv(attempts: TafAttempt[]): string {
    const headers = [
      "ID",
      "Data",
      "Duracao_Segundos",
      "Distancia_Metros",
      "Pace_Formatado",
      "Velocidade_Kmh",
      "Local",
      "Notas",
      "Origem",
      "ID_Externo",
      "Tenis",
      "FC_Media_Bpm",
      "FC_Max_Bpm",
      "Voltas_400m",
    ];

    const rows = attempts.map((a) => [
      sanitizeCsvTextCell(a.id),
      sanitizeCsvTextCell(a.testDate),
      formatCsvNumber(a.actualDurationSeconds),
      formatCsvNumber(a.distanceMeters),
      sanitizeCsvTextCell(a.paceFormatted, true),
      formatCsvNumber(a.speedKmh, 2),
      sanitizeCsvTextCell(a.locationType ?? "", true),
      sanitizeCsvTextCell(a.notes ?? "", true),
      sanitizeCsvTextCell(a.source ?? "manual"),
      sanitizeCsvTextCell(a.externalId ?? "", true),
      sanitizeCsvTextCell(a.shoeName ?? "", true),
      formatCsvNumber(a.avgHeartRate),
      formatCsvNumber(a.maxHeartRate),
      formatCsvNumber(Array.isArray(a.laps) ? a.laps.length : 0),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },

  exportTrainingsCsv(trainings: TrainingSession[]): string {
    const headers = [
      "ID",
      "Data",
      "Modalidade",
      "Distancia_Km",
      "Duracao_Segundos",
      "Pace_Formatado",
      "Velocidade_Kmh",
      "RPE_Esforco",
      "Peso_Kg",
      "Notas",
      "Origem",
      "ID_Externo",
      "Tempo_Decorrido_Segundos",
      "FC_Media_Bpm",
      "FC_Max_Bpm",
      "Cadencia_Media_Spm",
      "Ganho_Elevacao_M",
      "Tenis",
      "Calorias_Ativas",
      "Calorias_Totais",
    ];

    const rows = trainings.map((t) => [
      sanitizeCsvTextCell(t.id),
      sanitizeCsvTextCell(t.sessionDate),
      sanitizeCsvTextCell(t.activityType),
      formatCsvNumber(t.distanceKm, 2),
      formatCsvNumber(t.durationSeconds),
      sanitizeCsvTextCell(t.paceFormatted, true),
      formatCsvNumber(t.speedKmh, 2),
      formatCsvNumber(t.perceivedEffort),
      formatCsvNumber(t.bodyWeightKg),
      sanitizeCsvTextCell(t.notes ?? "", true),
      sanitizeCsvTextCell(t.source ?? "manual"),
      sanitizeCsvTextCell(t.externalId ?? "", true),
      formatCsvNumber(t.elapsedSeconds),
      formatCsvNumber(t.avgHeartRate),
      formatCsvNumber(t.maxHeartRate),
      formatCsvNumber(t.avgCadence),
      formatCsvNumber(t.elevationGainM),
      sanitizeCsvTextCell(t.shoeName ?? "", true),
      formatCsvNumber(t.activeCalories),
      formatCsvNumber(t.totalCalories),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },
};
