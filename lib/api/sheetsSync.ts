import { safeAutoSync, SingleSyncResult } from "@/lib/googleSheets";

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
