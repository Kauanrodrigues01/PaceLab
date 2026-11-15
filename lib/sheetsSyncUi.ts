import type {
  ActivitySource,
  BatchImportSummary,
  TafAttempt,
  TrainingSession,
} from "@/types";
import type { SheetsSyncReport } from "@/lib/googleSheets/types";
import { TafApiError } from "@/lib/services/tafService";

export interface SheetsSyncBadgeInfo {
  isSynced: boolean;
  label: string;
  title: string;
}

const SHEETS_NOT_CONFIGURED_MESSAGE =
  "Integração com Google Sheets não configurada neste ambiente. Defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64 no .env conforme o README.md.";

let clientRecordFallbackSeq = 0;

/**
 * Gera um identificador único no cliente (`trn_...`, `att_...` ou `grp_...`) resistente a colisões
 * em salvamentos consecutivos ou em lote no mesmo milissegundo.
 */
export function generateClientRecordId(prefix: "trn" | "att" | "grp"): string {
  const randomUuid =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : null;

  if (randomUuid) {
    return `${prefix}_${randomUuid}`;
  }

  clientRecordFallbackSeq = (clientRecordFallbackSeq + 1) % 1_000_000;
  const randomPart = Math.random().toString(36).slice(2, 10).padEnd(4, "0");
  return `${prefix}_${Date.now()}_${clientRecordFallbackSeq}_${randomPart}`;
}

/**
 * Formata o rótulo e o tooltip de status de sincronização para um card individual.
 */
export function formatSheetsSyncBadge(
  syncedToSheetsAt?: string | null
): SheetsSyncBadgeInfo {
  if (typeof syncedToSheetsAt === "string" && syncedToSheetsAt.trim().length > 0) {
    const parsedMs = Date.parse(syncedToSheetsAt);
    if (Number.isFinite(parsedMs)) {
      const formattedDate = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Fortaleza",
      }).format(new Date(parsedMs));

      return {
        isSynced: true,
        label: "Sheets ✓",
        title: `Sincronizado com Google Sheets em ${formattedDate}`,
      };
    }
  }

  return {
    isSynced: false,
    label: "Pendente Sheets",
    title: "Aguardando sincronização com a planilha Google Sheets",
  };
}

/**
 * Gera a mensagem resumida em português exibida no toast após sincronização bem-sucedida.
 */
function formatWeeklyPlanActivityDetail(
  weeklyPlan: SheetsSyncReport["weeklyPlan"]
): string | null {
  if (!weeklyPlan) return null;

  const parts: string[] = [];
  if (weeklyPlan.imported > 0) parts.push(`${weeklyPlan.imported} plano(s) importado(s)`);
  if (weeklyPlan.updated > 0) parts.push(`${weeklyPlan.updated} plano(s) atualizado(s)`);
  if (weeklyPlan.removed > 0) parts.push(`${weeklyPlan.removed} plano(s) removido(s)`);
  if (weeklyPlan.matched > 0) parts.push(`${weeklyPlan.matched} treino(s) conciliado(s)`);
  if (weeklyPlan.pushed > 0) parts.push(`${weeklyPlan.pushed} status enviado(s)`);

  if (parts.length === 0) return null;
  return `Plano Semanal: ${parts.join(", ")}`;
}

export function formatSheetsSyncReportSummary(report: SheetsSyncReport): string {
  const pushedNew = report.pushedAppended + report.tafPushedAppended;
  const updatedCount =
    report.pushedUpdated +
    report.pulledUpdated +
    report.pulledLinked +
    report.tafPushedUpdated +
    report.tafPulledUpdated +
    report.tafPulledLinked;
  const importedNew = report.pulledCreated + report.tafPulledCreated;
  const warningSuffix =
    report.warnings.length > 0 ? ` (${report.warnings.length} aviso(s))` : "";
  const weeklyDetail = formatWeeklyPlanActivityDetail(report.weeklyPlan);

  if (pushedNew > 0 || updatedCount > 0 || importedNew > 0) {
    const weeklySuffix = weeklyDetail ? ` (${weeklyDetail})` : "";
    return `Planilha sincronizada: ${pushedNew} enviado(s), ${updatedCount} atualizado(s), ${importedNew} importado(s) do Sheets${weeklySuffix}${warningSuffix}`;
  }

  if (report.profileSynced) {
    const weeklySuffix = weeklyDetail ? `; ${weeklyDetail}` : "";
    return `Planilha sincronizada: Perfil/Meta atualizados no Sheets${weeklySuffix}${warningSuffix}`;
  }

  if (weeklyDetail) {
    return `Planilha sincronizada (${weeklyDetail})${warningSuffix}`;
  }

  return `Planilha já estava atualizada (nenhuma pendência encontrada)${warningSuffix}`;
}

/**
 * Traduz erros de API de sincronização do Google Sheets em instruções claras em português.
 */
export function getSheetsSyncErrorMessage(
  error: unknown,
  fallbackMessage = "Erro ao sincronizar com o Google Sheets."
): string {
  if (error instanceof TafApiError) {
    if (error.code === "SHEETS_NOT_CONFIGURED") {
      return SHEETS_NOT_CONFIGURED_MESSAGE;
    }
    if (error.status === 503) {
      return (
        error.message ||
        "Integração com Google Sheets indisponível no momento. Verifique suas credenciais conforme o README.md."
      );
    }
    return error.message || fallbackMessage;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

/**
 * Consolida título e observações adicionais em um único campo notes compatível com Zod (<= 1.000 chars).
 */
export function combineTitleAndNotes(
  title: string,
  notes: string
): string | null {
  const cleanTitle = title.trim();
  const cleanNotes = notes.trim();
  const combinedRaw =
    cleanTitle && cleanNotes
      ? `${cleanTitle} — ${cleanNotes}`
      : cleanTitle || cleanNotes || "";

  return combinedRaw ? combinedRaw.slice(0, 1000) : null;
}

/**
 * Prefixa notas ao espelhar um simulado TAF no Diário de Treinos (Log_Treinos).
 */
export function buildMirroredTafNotes(rawNotes?: string | null): string {
  const clean = rawNotes?.trim();
  const prefixed = clean ? `[Simulado TAF] ${clean}` : "[Simulado TAF]";
  return prefixed.slice(0, 1000);
}

/**
 * Constrói um TrainingSession com ID trn_ distinto a partir de um TafAttempt salvo,
 * permitindo registro espelhado opcional em Log_Treinos sem colidir com Simulados_TAF.
 */
export function buildMirroredTrainingFromAttempt(params: {
  attempt: TafAttempt;
  source?: ActivitySource;
  externalId?: string | null;
  activeCalories?: number | null;
  calorieMethod?: string | null;
  calorieSource?: string | null;
  calorieMetadata?: Record<string, unknown> | null;
}): TrainingSession {
  const {
    attempt,
    source = attempt.source ?? "manual",
    externalId = null,
    activeCalories = null,
    calorieMethod = null,
    calorieSource = null,
    calorieMetadata = null,
  } = params;

  const nowIso = new Date().toISOString();

  return {
    id: generateClientRecordId("trn"),
    source,
    externalId,
    sessionDate: attempt.testDate,
    activityType: "tempo_run",
    distanceKm: Number((attempt.distanceMeters / 1000).toFixed(3)),
    durationSeconds: Math.round(attempt.actualDurationSeconds),
    speedKmh: attempt.speedKmh,
    paceSeconds: attempt.paceSeconds,
    paceFormatted: attempt.paceFormatted,
    avgHeartRate: attempt.avgHeartRate ?? null,
    maxHeartRate: attempt.maxHeartRate ?? null,
    shoeName: attempt.shoeName ?? null,
    notes: buildMirroredTafNotes(attempt.notes),
    splits: [],
    activeCalories,
    totalCalories: activeCalories,
    calorieMethod,
    calorieSource,
    calorieMetadata,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export const CROSS_PAGE_SHEETS_CACHE_KEYS = {
  trainings: "pacelab_cache_trainings",
  tafAttempts: "pacelab_cache_taf_attempts",
  tafTrainings: "pacelab_cache_taf_trainings",
  tafGoal: "pacelab_cache_taf_goal",
  weeklyPlan: "pacelab_cache_weekly_plan",
} as const;

/**
 * Remove os caches de sessão das páginas /treinos e /meu-taf para evitar dados obsoletos após sync com Sheets.
 */
export function clearCrossPageSheetsCaches(
  options: { includeGoal?: boolean } = {}
): void {
  if (typeof window === "undefined") return;
  const { includeGoal = true } = options;
  const keys = [
    CROSS_PAGE_SHEETS_CACHE_KEYS.trainings,
    CROSS_PAGE_SHEETS_CACHE_KEYS.tafAttempts,
    CROSS_PAGE_SHEETS_CACHE_KEYS.tafTrainings,
    CROSS_PAGE_SHEETS_CACHE_KEYS.weeklyPlan,
    ...(includeGoal ? [CROSS_PAGE_SHEETS_CACHE_KEYS.tafGoal] : []),
  ];

  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignorado defensivamente
    }
  }
}

/**
 * Formata a mensagem e severidade de toast único após importação em massa de treinos/simulados.
 */
export function formatBatchImportToast(summary: BatchImportSummary): {
  message: string;
  type: "success" | "error";
} {
  const targetLabel =
    summary.target === "training" ? "treino(s)" : "simulado(s) TAF";
  const parts: string[] = [];

  if (summary.savedCount > 0) {
    parts.push(`${summary.savedCount} novo(s)`);
  }
  if (summary.updatedCount > 0) {
    parts.push(`${summary.updatedCount} atualizado(s)`);
  }
  if (summary.skippedCount > 0) {
    parts.push(`${summary.skippedCount} pulado(s)`);
  }
  if (summary.mirroredCount > 0) {
    parts.push(`${summary.mirroredCount} espelhado(s) no Diário`);
  }

  const baseCountText =
    parts.length > 0
      ? `${parts.join(", ")} (${targetLabel})`
      : `${summary.totalItems} ${targetLabel} processado(s)`;

  if (summary.failedCount > 0) {
    return {
      type: "error",
      message: `Lote concluído com ${summary.failedCount} falha(s): ${baseCountText}. Revise os itens em vermelho e tente novamente.`,
    };
  }

  if (summary.aborted) {
    return {
      type: "error",
      message: `Importação em massa interrompida: ${baseCountText}.`,
    };
  }

  if (summary.mirrorFailedCount > 0) {
    return {
      type: "error",
      message: `${baseCountText}, mas ${summary.mirrorFailedCount} espelho(s) no Diário falharam.`,
    };
  }

  if (summary.sheetsSyncWarning) {
    return {
      type: "error",
      message: `${baseCountText} salvos no banco, mas o envio para o Google Sheets falhou: ${summary.sheetsSyncWarning}`,
    };
  }

  if (summary.sheetsSynced) {
    return {
      type: "success",
      message: `Lote importado: ${baseCountText} • Google Sheets sincronizado!`,
    };
  }

  return {
    type: "success",
    message: `Lote importado: ${baseCountText}.`,
  };
}
