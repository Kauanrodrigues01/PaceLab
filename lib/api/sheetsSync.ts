import {
  reconcileWeeklyPlansWithSessions,
  safeAutoSync,
  SingleSyncResult,
} from "@/lib/googleSheets";

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
}): Promise<void> {
  try {
    await reconcileWeeklyPlansWithSessions(options);
  } catch (err) {
    console.error("[WeeklyPlan] Falha não bloqueante na reconciliação local:", err);
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
