import { NextResponse } from "next/server";
import {
  extractGoogleApiStatus,
  GoogleSheetsNotConfiguredError,
  pullWeeklyPlanFromSheets,
  ReconcileWeeklyPlanResult,
  reconcileWeeklyPlansWithSessions,
  safeAutoSync,
  SingleSyncResult,
} from "@/lib/googleSheets";
import { apiError, ApiResponse } from "@/lib/api/response";
import { isGoogleSheetsConfigured } from "@/lib/env";
import { getFortalezaWeekBounds } from "@/lib/math/weeklyAdherence";
import { prisma } from "@/lib/prisma";

/**
 * Traduz erros da API Google Sheets para respostas HTTP padronizadas da API PaceLab.
 */
export function mapSheetsUpstreamError(
  error: unknown
): NextResponse<ApiResponse<null>> | null {
  if (error instanceof GoogleSheetsNotConfiguredError) {
    return apiError(error.message, 503, { code: "SHEETS_NOT_CONFIGURED" });
  }

  const upstreamStatus = extractGoogleApiStatus(error);
  if (upstreamStatus === undefined) {
    return null;
  }

  if (upstreamStatus === 429) {
    return apiError(
      "Limite de requisições da API Google Sheets excedido (HTTP 429). Aguarde cerca de 1 minuto e tente novamente.",
      429,
      { code: "SHEETS_QUOTA_EXCEEDED", upstreamStatus }
    );
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return apiError(
      "Permissão negada na planilha Google Sheets. Verifique se a planilha foi compartilhada como Editor com a Conta de Serviço e se GOOGLE_CREDENTIALS_BASE64 está válida.",
      502,
      { code: "SHEETS_PERMISSION_DENIED", upstreamStatus }
    );
  }

  if (upstreamStatus === 404) {
    return apiError(
      "Planilha ou aba não encontrada no Google Sheets (HTTP 404). Verifique GOOGLE_SHEETS_SPREADSHEET_ID e os nomes das abas obrigatórias.",
      502,
      { code: "SHEETS_NOT_FOUND", upstreamStatus }
    );
  }

  if (upstreamStatus === 503 || upstreamStatus >= 500) {
    return apiError(
      "Serviço Google Sheets temporariamente indisponível. Tente novamente em instantes.",
      503,
      { code: "SHEETS_UNAVAILABLE", upstreamStatus }
    );
  }

  return apiError(
    `Falha ao comunicar com a API Google Sheets (HTTP ${upstreamStatus}).`,
    502,
    { code: "SHEETS_UPSTREAM_ERROR", upstreamStatus }
  );
}

/**
 * Verifica se a requisição solicitou bypass da sincronização automática
 * via query param `?skipSheetsSync=true` (usado em importação em lote / backup).
 */
export function shouldSkipSheetsSync(request: Request): boolean {
  try {
    const { searchParams } = new URL(request.url, "http://localhost");
    const value = searchParams.get("skipSheetsSync")?.trim().toLowerCase();
    return value === "true" || value === "1";
  } catch {
    return false;
  }
}

/**
 * Executa a reconciliação local com `Plano_Semanal` após mutações já comitadas no banco,
 * isolando eventuais falhas secundárias para não mascarar o sucesso da operação principal.
 */
export async function safeReconcileWeeklyPlans(options?: {
  editedSessionId?: string;
}): Promise<ReconcileWeeklyPlanResult | undefined> {
  try {
    return await reconcileWeeklyPlansWithSessions(options);
  } catch (err) {
    console.error("[WeeklyPlan] Falha não bloqueante na reconciliação local:", err);
    return undefined;
  }
}

/**
 * Executa a sincronização pontual via `safeAutoSync` (await obrigatório antes de encerrar a request)
 * e reflete o timestamp atualizado em `syncedToSheetsAt` apenas quando houver sucesso real.
 */
export async function syncRecordWithSheets<
  TRecord extends { syncedToSheetsAt?: Date | null },
>(
  record: TRecord,
  syncFn: () => Promise<SingleSyncResult>,
  options?: { skip?: boolean }
): Promise<TRecord> {
  if (options?.skip) {
    return record;
  }

  const syncResult = await safeAutoSync(syncFn);
  if (!syncResult.ok || syncResult.skipped) {
    return record;
  }

  const syncedAt =
    syncResult.data?.syncedAt instanceof Date
      ? syncResult.data.syncedAt
      : typeof syncResult.syncedAt === "string"
        ? new Date(syncResult.syncedAt)
        : null;

  return syncedAt && !Number.isNaN(syncedAt.getTime())
    ? { ...record, syncedToSheetsAt: syncedAt }
    : record;
}

/**
 * Garante que o planejamento semanal da data da sessão já esteja presente no PostgreSQL
 * antes de reconciliar, puxando `Plano_Semanal` sob demanda caso o banco ainda não possua
 * itens naquela semana (evitando que treinos recém-salvos deixem `H:I` sem atualização).
 */
async function ensureWeeklyPlanLoadedForSession(
  sessionDate?: Date | string | null
): Promise<void> {
  if (!sessionDate || !isGoogleSheetsConfigured()) return;
  if (typeof prisma?.weeklyPlanItem?.count !== "function") return;
  if (typeof pullWeeklyPlanFromSheets !== "function") return;

  try {
    const { weekStart, weekEnd } = getFortalezaWeekBounds(sessionDate);
    // plannedDate é ancorado em meio-dia UTC (12:00:00Z), portanto a janela exata
    // Segunda 00:00Z .. Domingo 23:59:59.999Z isola apenas a semana da sessão sem invadir semanas adjacentes.
    const existingCount = await prisma.weeklyPlanItem.count({
      where: {
        plannedDate: {
          gte: new Date(`${weekStart}T00:00:00.000Z`),
          lte: new Date(`${weekEnd}T23:59:59.999Z`),
        },
      },
    });

    if (existingCount === 0) {
      await safeAutoSync(() => pullWeeklyPlanFromSheets());
    }
  } catch (err) {
    console.error("[WeeklyPlan] Falha não bloqueante ao verificar/puxar plano sob demanda:", err);
  }
}

/**
 * Executa o ciclo completo pós-mutação de `TrainingSession`: garante o plano semanal carregado
 * (quando Sheets estiver ativo), reconcilia `Plano_Semanal`, sincroniza a sessão com `Log_Treinos`
 * e propaga o status atualizado (`H:I`) para o Sheets.
 */
export async function syncTrainingRecordWithPlanAndSheets<
  TRecord extends { syncedToSheetsAt?: Date | null; sessionDate?: Date | string | null },
>(
  record: TRecord,
  syncSessionFn: () => Promise<SingleSyncResult>,
  pushWeeklyPlanFn: () => Promise<unknown>,
  options: { skipSheetsSync: boolean; editedSessionId?: string }
): Promise<TRecord> {
  if (!options.skipSheetsSync) {
    await ensureWeeklyPlanLoadedForSession(record.sessionDate);
  }

  await safeReconcileWeeklyPlans(
    options.editedSessionId ? { editedSessionId: options.editedSessionId } : undefined
  );

  const syncedRecord = await syncRecordWithSheets(record, syncSessionFn, {
    skip: options.skipSheetsSync,
  });

  if (!options.skipSheetsSync) {
    await safeAutoSync(pushWeeklyPlanFn);
  }

  return syncedRecord;
}
