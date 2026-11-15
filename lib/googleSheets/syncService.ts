import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { sheets_v4 } from "@googleapis/sheets";
import { getGoogleSheetsEnvConfig, isGoogleSheetsConfigured } from "@/lib/env";
import {
  extractGoogleApiStatus,
  getGoogleSheetsClient,
  getSheetIdByTitle,
  withSheetsRetry,
} from "@/lib/googleSheets/client";
import {
  SHEET_HEADERS,
  SHEET_RANGES,
  SHEET_TABS,
  SheetProfileInput,
  SheetTafAttemptInput,
  SheetTafGoalInput,
  SheetTrainingSessionInput,
  SheetWeightRecordInput,
  ParsedTafAttemptSheetRow,
  ParsedTrainingSheetRow,
  ParsedWeeklyPlanSheetRow,
  formatDateFortaleza,
  hasProfileGoalRowDivergence,
  hasTafAttemptRowDivergence,
  hasTrainingRowDivergence,
  isBlankSheetRow,
  mapProfileAndGoalToRow,
  mapTafAttemptToRow,
  mapTrainingSessionToRow,
  parseSheetDate,
  parseTafAttemptRowFromSheet,
  parseTrainingRowFromSheet,
  parseWeeklyPlanRowFromSheet,
} from "@/lib/googleSheets/mapper";
import {
  SafeAutoSyncResult,
  SheetRowWarning,
  SheetTabName,
  SheetsSyncDirection,
  SheetsSyncOptions,
  SheetsSyncReport,
  SheetsSyncStatus,
  WeeklyPlanStandaloneSyncResult,
  WeeklyPlanSyncStats,
} from "@/lib/googleSheets/types";
import { buildCaloriePayload, estimateTrainingCalories } from "@/lib/math/calories";
import {
  computeUnmatchedPlanStatus,
  computeWeeklyReconciliation,
  evaluateLinkedSessionValidity,
  getFortalezaWeekBounds,
  isRestPlanActivity,
  toFortalezaDateKey,
} from "@/lib/math/weeklyAdherence";
import { prisma } from "@/lib/prisma";

const BATCH_CHUNK_SIZE = 200;
const DIRTY_TOLERANCE_MS = 2000;
const TRAINING_DEDUP_DISTANCE_METERS = 50;
const TRAINING_DEDUP_DURATION_S = 10;
const TAF_DEDUP_DISTANCE_M = 25;
const TAF_DEDUP_DURATION_S = 10;
const ALL_REQUIRED_TABS: readonly SheetTabName[] = [
  SHEET_TABS.LOG_TREINOS,
  SHEET_TABS.SIMULADOS_TAF,
  SHEET_TABS.PERFIL_E_METAS,
];
const ensuredSchemaByClient = new WeakMap<sheets_v4.Sheets, Set<string>>();

const TAB_HEADER_RANGE_MAP: Record<SheetTabName, string> = {
  [SHEET_TABS.LOG_TREINOS]: `${SHEET_TABS.LOG_TREINOS}!A1:O1`,
  [SHEET_TABS.SIMULADOS_TAF]: `${SHEET_TABS.SIMULADOS_TAF}!A1:J1`,
  [SHEET_TABS.PERFIL_E_METAS]: `${SHEET_TABS.PERFIL_E_METAS}!A1:I1`,
  [SHEET_TABS.PLANO_SEMANAL]: `${SHEET_TABS.PLANO_SEMANAL}!A1:I1`,
};

const TAB_HEADERS_MAP: Record<SheetTabName, readonly string[]> = {
  [SHEET_TABS.LOG_TREINOS]: SHEET_HEADERS.LOG_TREINOS,
  [SHEET_TABS.SIMULADOS_TAF]: SHEET_HEADERS.SIMULADOS_TAF,
  [SHEET_TABS.PERFIL_E_METAS]: SHEET_HEADERS.PERFIL_E_METAS,
  [SHEET_TABS.PLANO_SEMANAL]: SHEET_HEADERS.PLANO_SEMANAL,
};

export interface SheetsSyncDependencies {
  now?: () => Date;
  generateId?: () => string;
}

export interface SingleSyncResult {
  syncedAt: Date;
  action: "appended" | "updated";
}

export interface ProfileSyncResult {
  syncedAt: Date;
}

export interface DeleteSheetRowResult {
  deleted: boolean;
  deletedCount: number;
}

export interface HistoricalBackfillResult {
  pushedAppended: number;
  pushedUpdated: number;
  tafPushedAppended: number;
  tafPushedUpdated: number;
  profileSynced: boolean;
  syncedAt: Date;
}

export interface PullChangesResult {
  pulledUpdated: number;
  pulledCreated: number;
  pulledLinked: number;
  tafPulledUpdated: number;
  tafPulledCreated: number;
  tafPulledLinked: number;
  skipped: number;
  warnings: SheetRowWarning[];
}

interface PullInternalOptions {
  onlyUnlinkedRows?: boolean;
}

interface SheetUpdateEntry {
  range: string;
  values: (string | number)[][];
}

interface TaggedUpdateEntry<TId extends string = string> {
  id: TId;
  entry: SheetUpdateEntry;
}

interface TaggedAppendEntry<TId extends string = string> {
  id: TId;
  row: (string | number)[];
}

function resolveDeps(deps?: SheetsSyncDependencies): {
  now: () => Date;
  generateId: () => string;
} {
  return {
    now: deps?.now ?? (() => new Date()),
    generateId: deps?.generateId ?? (() => crypto.randomUUID()),
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeCellString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function buildRowIndexMapFromColumn(
  rows: unknown[][] | null | undefined,
  startRow = 2
): Map<string, number> {
  const rowMap = new Map<string, number>();
  if (!rows) return rowMap;

  for (let i = 0; i < rows.length; i += 1) {
    const id = normalizeCellString(rows[i]?.[0]);
    if (id && !rowMap.has(id)) {
      rowMap.set(id, startRow + i);
    }
  }

  return rowMap;
}

function findMatchedRowNumbersDesc(
  rows: unknown[][] | null | undefined,
  targetId: string,
  startRow = 2
): number[] {
  if (!rows) return [];
  const matches: number[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    if (normalizeCellString(rows[i]?.[0]) === targetId) {
      matches.push(startRow + i);
    }
  }

  return matches.sort((a, b) => b - a);
}

function isDirtyRecord(
  syncedToSheetsAt: Date | null | undefined,
  updatedAt: Date | null | undefined
): boolean {
  if (!syncedToSheetsAt) return true;
  if (!updatedAt) return false;
  return updatedAt.getTime() - syncedToSheetsAt.getTime() > DIRTY_TOLERANCE_MS;
}

/**
 * Protege registros do banco que ainda possuem alterações locais pendentes de push (`dirty`),
 * preservando compatibilidade com fixtures parciais onde `syncedToSheetsAt` foi omitido (`undefined`).
 */
function shouldProtectDirtyLocalRecord(existing: {
  syncedToSheetsAt?: Date | null;
  updatedAt?: Date | null;
}): boolean {
  return (
    existing.syncedToSheetsAt !== undefined &&
    isDirtyRecord(existing.syncedToSheetsAt, existing.updatedAt)
  );
}

function isProtectedTelemetrySource(source?: string | null): boolean {
  return source === "fit_upload" || source === "gpx_upload";
}

function isHeaderRow(row: unknown[], rowNumber: number): boolean {
  if (rowNumber !== 1) return false;
  const firstCol = normalizeCellString(row[0]).toUpperCase();
  const secondCol = normalizeCellString(row[1]).toUpperCase();
  return firstCol === "ID" || (firstCol === "NOME" && secondCol === "IDADE");
}

function resolveProfileWeightKg(
  profile?: SheetProfileInput | null,
  latestWeight?: SheetWeightRecordInput | null
): number | null {
  const recordWeight =
    typeof latestWeight?.weightKg === "number" && Number.isFinite(latestWeight.weightKg)
      ? latestWeight.weightKg
      : null;
  const profileWeight =
    typeof profile?.currentWeightKg === "number" && Number.isFinite(profile.currentWeightKg)
      ? profile.currentWeightKg
      : null;

  if (recordWeight === null) return profileWeight;
  if (profileWeight === null) return recordWeight;

  const recordMs = latestWeight?.recordedAt ? new Date(latestWeight.recordedAt).getTime() : NaN;
  const profileMs = profile?.updatedAt ? new Date(profile.updatedAt).getTime() : NaN;

  if (Number.isFinite(recordMs) && Number.isFinite(profileMs)) {
    return recordMs >= profileMs ? recordWeight : profileWeight;
  }

  return recordWeight;
}

function buildCaloriesUpdateOrCreate(
  activityType: ParsedTrainingSheetRow["activityType"],
  speedKmh: number,
  durationSeconds: number,
  weightKg: number | null,
  clearMetadataOnNull = false
): {
  activeCalories: number | null;
  totalCalories: number | null;
  metValue: number | null;
  calorieMethod: string | null;
  calorieSource: string | null;
  calorieMetadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
} {
  const estimate =
    weightKg !== null && weightKg > 0
      ? estimateTrainingCalories({
          activityType,
          speedKmh,
          durationSeconds,
          weightKg,
        })
      : null;

  const payload = buildCaloriePayload(estimate);
  return {
    activeCalories: payload.activeCalories,
    totalCalories: payload.totalCalories,
    metValue: payload.metValue,
    calorieMethod: payload.calorieMethod,
    calorieSource: payload.calorieSource,
    ...(payload.calorieMetadata
      ? { calorieMetadata: payload.calorieMetadata }
      : clearMetadataOnNull
        ? { calorieMetadata: Prisma.DbNull }
        : {}),
  };
}

async function ensureSpreadsheetSchema(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabsToEnsure: readonly SheetTabName[] = ALL_REQUIRED_TABS
): Promise<void> {
  let ensuredForClient = ensuredSchemaByClient.get(sheets);
  if (!ensuredForClient) {
    ensuredForClient = new Set<string>();
    ensuredSchemaByClient.set(sheets, ensuredForClient);
  }

  const missingInCache = tabsToEnsure.filter(
    (tab) => !ensuredForClient.has(`${spreadsheetId}::${tab}`)
  );
  if (missingInCache.length === 0) {
    return;
  }

  const metaRes = await withSheetsRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title))",
    })
  );

  // Mantém compatibilidade defensiva com mocks parciais em testes unitários que não stubbam `spreadsheets.get`.
  if (!metaRes || !metaRes.data || !Array.isArray(metaRes.data.sheets)) {
    return;
  }

  const existingTitles = new Set(
    metaRes.data.sheets
      .map((sheet) => sheet.properties?.title?.trim())
      .filter((title): title is string => Boolean(title))
  );

  const missingTabs = ALL_REQUIRED_TABS.filter((tab) => !existingTitles.has(tab));
  if (missingTabs.length > 0) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingTabs.map((title) => ({
            addSheet: {
              properties: { title },
            },
          })),
        },
      })
    );
  }

  const existingTabs = ALL_REQUIRED_TABS.filter((tab) => existingTitles.has(tab));
  const tabsMissingHeaders = new Set<SheetTabName>(missingTabs);

  if (existingTabs.length > 0) {
    const headersCheckRes = await withSheetsRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: existingTabs.map((tab) => TAB_HEADER_RANGE_MAP[tab]),
        valueRenderOption: "FORMATTED_VALUE",
      })
    );
    const valueRanges = headersCheckRes?.data?.valueRanges ?? [];
    for (let i = 0; i < existingTabs.length; i += 1) {
      const firstRow = valueRanges[i]?.values?.[0];
      if (!firstRow || isBlankSheetRow(firstRow)) {
        tabsMissingHeaders.add(existingTabs[i]);
      }
    }
  }

  if (tabsMissingHeaders.size > 0) {
    const headerUpdates: SheetUpdateEntry[] = [];
    for (const tab of ALL_REQUIRED_TABS) {
      if (!tabsMissingHeaders.has(tab)) continue;
      headerUpdates.push({
        range: TAB_HEADER_RANGE_MAP[tab],
        values: [[...TAB_HEADERS_MAP[tab]]],
      });
    }

    await withSheetsRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: headerUpdates,
        },
      })
    );
  }

  for (const tab of ALL_REQUIRED_TABS) {
    ensuredForClient.add(`${spreadsheetId}::${tab}`);
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const rec = error as Error & {
      response?: { data?: { error?: { message?: unknown } } };
    };
    if (typeof rec.response?.data?.error?.message === "string") {
      return `${error.message} ${rec.response.data.error.message}`;
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    const rec = error as {
      message?: unknown;
      response?: { data?: { error?: { message?: unknown } } };
      errors?: Array<{ message?: unknown }>;
    };
    if (typeof rec.response?.data?.error?.message === "string") {
      return rec.response.data.error.message;
    }
    if (typeof rec.message === "string") {
      return rec.message;
    }
    if (typeof rec.errors?.[0]?.message === "string") {
      return rec.errors[0].message;
    }
  }

  return String(error ?? "");
}

function isMissingTabError(error: unknown): boolean {
  const status = extractGoogleApiStatus(error);
  const msg = extractErrorMessage(error);
  if (status === 404) return true;
  if (status === 400 && /unable to parse range/i.test(msg)) return true;
  return /aba\s+["'].*["']\s+não encontrada/i.test(msg);
}

async function upsertRowById(params: {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  tabName: SheetTabName;
  idsRange: string;
  dataRange: string;
  lastColumn: string;
  id: string;
  rowValues: (string | number)[];
}): Promise<"appended" | "updated"> {
  const { sheets, spreadsheetId, tabName, idsRange, dataRange, lastColumn, id, rowValues } =
    params;

  await ensureSpreadsheetSchema(sheets, spreadsheetId, [tabName]);

  const existingIdsRes = await withSheetsRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: idsRange,
      valueRenderOption: "FORMATTED_VALUE",
    })
  );

  const rowMap = buildRowIndexMapFromColumn(existingIdsRes.data.values, 2);
  const existingRowNumber = rowMap.get(id);

  if (existingRowNumber !== undefined) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A${existingRowNumber}:${lastColumn}${existingRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [rowValues],
        },
      })
    );
    return "updated";
  }

  await withSheetsRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: dataRange,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [rowValues],
      },
    })
  );
  return "appended";
}

async function deleteRowsById(
  tabName: SheetTabName,
  idsRange: string,
  id: string
): Promise<DeleteSheetRowResult> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return { deleted: false, deletedCount: 0 };
  }

  const { sheets, spreadsheetId } = getGoogleSheetsClient();

  try {
    const existingIdsRes = await withSheetsRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: idsRange,
        valueRenderOption: "FORMATTED_VALUE",
      })
    );

    const matchedRowsDesc = findMatchedRowNumbersDesc(existingIdsRes.data.values, normalizedId, 2);
    if (matchedRowsDesc.length === 0) {
      return { deleted: false, deletedCount: 0 };
    }

    const sheetId = await getSheetIdByTitle(sheets, spreadsheetId, tabName);

    await withSheetsRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: matchedRowsDesc.map((rowNumber) => ({
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          })),
        },
      })
    );

    return { deleted: true, deletedCount: matchedRowsDesc.length };
  } catch (error) {
    if (isMissingTabError(error)) {
      return { deleted: false, deletedCount: 0 };
    }
    throw error;
  }
}

async function writeProfileAndGoalToSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  profile: SheetProfileInput | null,
  goal: SheetTafGoalInput | null,
  latestWeight: SheetWeightRecordInput | null,
  precomputedRow?: (string | number)[]
): Promise<void> {
  await ensureSpreadsheetSchema(sheets, spreadsheetId, [SHEET_TABS.PERFIL_E_METAS]);

  const rowValues = precomputedRow ?? mapProfileAndGoalToRow(profile, goal, latestWeight);

  await withSheetsRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: SHEET_RANGES.PERFIL_E_METAS_ROW,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowValues],
      },
    })
  );
}

async function fetchProfileGoalWeightSnapshot(): Promise<{
  profile: SheetProfileInput | null;
  goal: SheetTafGoalInput | null;
  latestWeight: SheetWeightRecordInput | null;
}> {
  const [profile, goal, latestWeight] = await Promise.all([
    prisma.userProfile.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.tafGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.weightRecord.findFirst({ orderBy: { recordedAt: "desc" } }),
  ]);

  return { profile, goal, latestWeight };
}

/**
 * Sincroniza uma única `TrainingSession` para a aba `Log_Treinos` (append ou update por UUID/ID)
 * e registra `syncedToSheetsAt` no PostgreSQL.
 */
export async function syncTrainingSessionToSheet(
  sessionOrId: string | SheetTrainingSessionInput,
  deps?: SheetsSyncDependencies
): Promise<SingleSyncResult> {
  const { now } = resolveDeps(deps);
  const session =
    typeof sessionOrId === "string"
      ? await prisma.trainingSession.findUnique({ where: { id: sessionOrId } })
      : sessionOrId;

  if (!session) {
    throw new Error(`TrainingSession "${String(sessionOrId)}" não encontrada para sincronização.`);
  }

  const { sheets, spreadsheetId } = getGoogleSheetsClient();
  const action = await upsertRowById({
    sheets,
    spreadsheetId,
    tabName: SHEET_TABS.LOG_TREINOS,
    idsRange: SHEET_RANGES.LOG_TREINOS_IDS,
    dataRange: SHEET_RANGES.LOG_TREINOS_DATA,
    lastColumn: "O",
    id: session.id,
    rowValues: mapTrainingSessionToRow(session),
  });

  const syncedAt = now();
  await prisma.trainingSession.update({
    where: { id: session.id },
    data: { syncedToSheetsAt: syncedAt },
  });

  return { syncedAt, action };
}

/**
 * Sincroniza uma única tentativa `TafAttempt` para `Simulados_TAF` calculando `Status Meta`
 * contra o `TafGoal` ativo, e registra `syncedToSheetsAt` no PostgreSQL.
 */
export async function syncTafAttemptToSheet(
  attemptOrId: string | SheetTafAttemptInput,
  deps?: SheetsSyncDependencies
): Promise<SingleSyncResult> {
  const { now } = resolveDeps(deps);
  const attempt =
    typeof attemptOrId === "string"
      ? await prisma.tafAttempt.findUnique({ where: { id: attemptOrId } })
      : attemptOrId;

  if (!attempt) {
    throw new Error(`TafAttempt "${String(attemptOrId)}" não encontrado para sincronização.`);
  }

  const goal = await prisma.tafGoal.findFirst({ orderBy: { updatedAt: "desc" } });
  const { sheets, spreadsheetId } = getGoogleSheetsClient();

  const action = await upsertRowById({
    sheets,
    spreadsheetId,
    tabName: SHEET_TABS.SIMULADOS_TAF,
    idsRange: SHEET_RANGES.SIMULADOS_TAF_IDS,
    dataRange: SHEET_RANGES.SIMULADOS_TAF_DATA,
    lastColumn: "J",
    id: attempt.id,
    rowValues: mapTafAttemptToRow(attempt, goal),
  });

  const syncedAt = now();
  await prisma.tafAttempt.update({
    where: { id: attempt.id },
    data: { syncedToSheetsAt: syncedAt },
  });

  return { syncedAt, action };
}

/**
 * Atualiza a linha 2 da aba `Perfil_e_Metas` com o retrato atual de perfil, pesagem mais recente e meta do TAF.
 */
export async function syncProfileAndGoalToSheet(
  deps?: SheetsSyncDependencies
): Promise<ProfileSyncResult> {
  const { now } = resolveDeps(deps);
  const { profile, goal, latestWeight } = await fetchProfileGoalWeightSnapshot();
  const { sheets, spreadsheetId } = getGoogleSheetsClient();

  await writeProfileAndGoalToSheet(sheets, spreadsheetId, profile, goal, latestWeight);

  return { syncedAt: now() };
}

/**
 * Remove todas as ocorrências do `id` da aba `Log_Treinos` na planilha via `deleteDimension`.
 */
export async function deleteTrainingSessionFromSheet(id: string): Promise<DeleteSheetRowResult> {
  return deleteRowsById(SHEET_TABS.LOG_TREINOS, SHEET_RANGES.LOG_TREINOS_IDS, id);
}

/**
 * Remove todas as ocorrências do `id` da aba `Simulados_TAF` na planilha via `deleteDimension`.
 */
export async function deleteTafAttemptFromSheet(id: string): Promise<DeleteSheetRowResult> {
  return deleteRowsById(SHEET_TABS.SIMULADOS_TAF, SHEET_RANGES.SIMULADOS_TAF_IDS, id);
}

async function flushChunkedAppends(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  entries: TaggedAppendEntry[],
  succeededIds: string[]
): Promise<number> {
  let appendedCount = 0;

  for (const chunk of chunkArray(entries, BATCH_CHUNK_SIZE)) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: chunk.map((item) => item.row),
        },
      })
    );

    for (const item of chunk) {
      succeededIds.push(item.id);
    }
    appendedCount += chunk.length;
  }

  return appendedCount;
}

/**
 * Executa backfill em lote (incremental por padrão, ou completo quando `forceFullResync = true`)
 * enviando atualizações e novos registros em chunks de 200 linhas respeitando ordem cronológica.
 */
export async function syncHistoricalDataToSheets(
  options: { forceFullResync?: boolean } = {},
  deps?: SheetsSyncDependencies
): Promise<HistoricalBackfillResult> {
  const { now } = resolveDeps(deps);
  const forceFullResync = Boolean(options.forceFullResync);
  const { sheets, spreadsheetId } = getGoogleSheetsClient();

  await ensureSpreadsheetSchema(sheets, spreadsheetId, ALL_REQUIRED_TABS);

  const [trainings, attempts, snapshot, batchIdsRes] = await Promise.all([
    prisma.trainingSession.findMany({ orderBy: { sessionDate: "asc" } }),
    prisma.tafAttempt.findMany({ orderBy: { testDate: "asc" } }),
    fetchProfileGoalWeightSnapshot(),
    withSheetsRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [
          SHEET_RANGES.LOG_TREINOS_IDS,
          SHEET_RANGES.SIMULADOS_TAF_IDS,
          SHEET_RANGES.PERFIL_E_METAS_ROW,
        ],
        valueRenderOption: "FORMATTED_VALUE",
      })
    ),
  ]);

  const targetTrainings = forceFullResync
    ? trainings
    : trainings.filter((session) => isDirtyRecord(session.syncedToSheetsAt, session.updatedAt));
  const targetAttempts = forceFullResync
    ? attempts
    : attempts.filter((attempt) => isDirtyRecord(attempt.syncedToSheetsAt, attempt.updatedAt));

  const valueRanges = batchIdsRes.data.valueRanges ?? [];
  const trainingRowMap = buildRowIndexMapFromColumn(valueRanges[0]?.values, 2);
  const tafRowMap = buildRowIndexMapFromColumn(valueRanges[1]?.values, 2);
  const hasProfileRangeInResponse = valueRanges.length >= 3 && valueRanges[2] !== undefined;
  const existingProfileRow = valueRanges[2]?.values?.[0];
  const expectedProfileRow = mapProfileAndGoalToRow(
    snapshot.profile,
    snapshot.goal,
    snapshot.latestWeight
  );
  const shouldWriteProfile =
    forceFullResync ||
    !hasProfileRangeInResponse ||
    hasProfileGoalRowDivergence(existingProfileRow, expectedProfileRow);

  const updateEntries: TaggedUpdateEntry[] = [];
  const trainingUpdateIds = new Set<string>();
  const trainingAppends: TaggedAppendEntry[] = [];
  const tafAppends: TaggedAppendEntry[] = [];

  for (const session of targetTrainings) {
    const rowValues = mapTrainingSessionToRow(session);
    const existingRow = trainingRowMap.get(session.id);

    if (existingRow !== undefined) {
      trainingUpdateIds.add(session.id);
      updateEntries.push({
        id: session.id,
        entry: {
          range: `${SHEET_TABS.LOG_TREINOS}!A${existingRow}:O${existingRow}`,
          values: [rowValues],
        },
      });
    } else {
      trainingAppends.push({ id: session.id, row: rowValues });
    }
  }

  for (const attempt of targetAttempts) {
    const rowValues = mapTafAttemptToRow(attempt, snapshot.goal);
    const existingRow = tafRowMap.get(attempt.id);

    if (existingRow !== undefined) {
      updateEntries.push({
        id: attempt.id,
        entry: {
          range: `${SHEET_TABS.SIMULADOS_TAF}!A${existingRow}:J${existingRow}`,
          values: [rowValues],
        },
      });
    } else {
      tafAppends.push({ id: attempt.id, row: rowValues });
    }
  }

  const succeededTrainingIds: string[] = [];
  const succeededTafIds: string[] = [];
  let pushedUpdated = 0;
  let pushedAppended = 0;
  let tafPushedUpdated = 0;
  let tafPushedAppended = 0;
  let profileSynced = false;
  let primaryError: unknown = null;

  try {
    for (const chunk of chunkArray(updateEntries, BATCH_CHUNK_SIZE)) {
      await withSheetsRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: chunk.map((item) => item.entry),
          },
        })
      );

      for (const item of chunk) {
        if (trainingUpdateIds.has(item.id)) {
          succeededTrainingIds.push(item.id);
          pushedUpdated += 1;
        } else {
          succeededTafIds.push(item.id);
          tafPushedUpdated += 1;
        }
      }
    }

    pushedAppended = await flushChunkedAppends(
      sheets,
      spreadsheetId,
      SHEET_RANGES.LOG_TREINOS_DATA,
      trainingAppends,
      succeededTrainingIds
    );

    tafPushedAppended = await flushChunkedAppends(
      sheets,
      spreadsheetId,
      SHEET_RANGES.SIMULADOS_TAF_DATA,
      tafAppends,
      succeededTafIds
    );

    if (shouldWriteProfile) {
      await writeProfileAndGoalToSheet(
        sheets,
        spreadsheetId,
        snapshot.profile,
        snapshot.goal,
        snapshot.latestWeight,
        expectedProfileRow
      );
      profileSynced = true;
    }
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    const checkpointAt = now();

    const persistCheckpoints = async () => {
      if (succeededTrainingIds.length > 0) {
        await prisma.trainingSession.updateMany({
          where: { id: { in: succeededTrainingIds } },
          data: { syncedToSheetsAt: checkpointAt },
        });
      }

      if (succeededTafIds.length > 0) {
        await prisma.tafAttempt.updateMany({
          where: { id: { in: succeededTafIds } },
          data: { syncedToSheetsAt: checkpointAt },
        });
      }
    };

    if (primaryError !== null) {
      await persistCheckpoints().catch((checkpointErr) => {
        console.error(
          "[SheetsSync] Falha secundária ao gravar checkpoint após erro na Google API:",
          checkpointErr
        );
      });
    } else {
      await persistCheckpoints();
    }
  }

  return {
    pushedAppended,
    pushedUpdated,
    tafPushedAppended,
    tafPushedUpdated,
    profileSynced,
    syncedAt: now(),
  };
}

function findDeduplicatedTraining<
  T extends SheetTrainingSessionInput & { id: string },
>(
  candidates: T[],
  linkedIds: Set<string>,
  parsed: ParsedTrainingSheetRow
): T | undefined {
  const targetDay = formatDateFortaleza(parsed.sessionDate);

  return candidates.find((candidate) => {
    if (linkedIds.has(candidate.id)) return false;
    if (formatDateFortaleza(candidate.sessionDate) !== targetDay) return false;
    const distanceDiffMeters = Math.round(Math.abs(candidate.distanceKm - parsed.distanceKm) * 1000);
    if (distanceDiffMeters > TRAINING_DEDUP_DISTANCE_METERS) {
      return false;
    }
    if (
      Math.abs(candidate.durationSeconds - parsed.durationSeconds) > TRAINING_DEDUP_DURATION_S
    ) {
      return false;
    }
    return true;
  });
}

function findDeduplicatedAttempt<T extends SheetTafAttemptInput & { id: string }>(
  candidates: T[],
  linkedIds: Set<string>,
  parsed: ParsedTafAttemptSheetRow
): T | undefined {
  const targetDay = formatDateFortaleza(parsed.testDate);

  return candidates.find((candidate) => {
    if (linkedIds.has(candidate.id)) return false;
    if (formatDateFortaleza(candidate.testDate) !== targetDay) return false;
    if (Math.abs(candidate.distanceMeters - parsed.distanceMeters) > TAF_DEDUP_DISTANCE_M) {
      return false;
    }
    if (
      Math.abs(candidate.actualDurationSeconds - parsed.actualDurationSeconds) >
      TAF_DEDUP_DURATION_S
    ) {
      return false;
    }
    return true;
  });
}

function buildTrainingUpdateData(
  existing: SheetTrainingSessionInput,
  parsed: ParsedTrainingSheetRow,
  syncedAt: Date,
  fallbackWeightKg: number | null
): Record<string, unknown> {
  if (isProtectedTelemetrySource(existing.source)) {
    return {
      activityType: parsed.activityType,
      perceivedEffort: parsed.perceivedEffort,
      bodyWeightKg: parsed.bodyWeightKg,
      shoeName: parsed.shoeName,
      notes: parsed.notes,
      syncedToSheetsAt: syncedAt,
    };
  }

  const effectiveWeight = parsed.bodyWeightKg ?? fallbackWeightKg;
  const calorieFields = buildCaloriesUpdateOrCreate(
    parsed.activityType,
    parsed.speedKmh,
    parsed.durationSeconds,
    effectiveWeight,
    true
  );

  return {
    sessionDate: parsed.sessionDate,
    activityType: parsed.activityType,
    distanceKm: parsed.distanceKm,
    durationSeconds: parsed.durationSeconds,
    speedKmh: parsed.speedKmh,
    paceSeconds: parsed.paceSeconds,
    paceFormatted: parsed.paceFormatted,
    avgHeartRate: parsed.avgHeartRate,
    maxHeartRate: parsed.maxHeartRate,
    elevationGainM: parsed.elevationGainM,
    avgCadence: parsed.avgCadence,
    perceivedEffort: parsed.perceivedEffort,
    bodyWeightKg: parsed.bodyWeightKg,
    shoeName: parsed.shoeName,
    notes: parsed.notes,
    ...calorieFields,
    syncedToSheetsAt: syncedAt,
  };
}

function buildMergedTrainingData(
  existing: SheetTrainingSessionInput,
  parsed: ParsedTrainingSheetRow,
  syncedAt: Date,
  fallbackWeightKg: number | null
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    syncedToSheetsAt: syncedAt,
  };

  if (existing.perceivedEffort == null && parsed.perceivedEffort != null) {
    data.perceivedEffort = parsed.perceivedEffort;
  }
  if (existing.bodyWeightKg == null && parsed.bodyWeightKg != null) {
    data.bodyWeightKg = parsed.bodyWeightKg;
  }
  if (!existing.shoeName && parsed.shoeName) {
    data.shoeName = parsed.shoeName;
  }
  if (!existing.notes && parsed.notes) {
    data.notes = parsed.notes;
  }

  if (!isProtectedTelemetrySource(existing.source)) {
    if (existing.avgHeartRate == null && parsed.avgHeartRate != null) {
      data.avgHeartRate = parsed.avgHeartRate;
    }
    if (existing.maxHeartRate == null && parsed.maxHeartRate != null) {
      data.maxHeartRate = parsed.maxHeartRate;
    }
    if (existing.elevationGainM == null && parsed.elevationGainM != null) {
      data.elevationGainM = parsed.elevationGainM;
    }
    if (existing.avgCadence == null && parsed.avgCadence != null) {
      data.avgCadence = parsed.avgCadence;
    }

    const effectiveWeight = existing.bodyWeightKg ?? parsed.bodyWeightKg ?? fallbackWeightKg;
    if (
      effectiveWeight !== null &&
      effectiveWeight > 0 &&
      (existing.activeCalories == null || (existing.bodyWeightKg == null && parsed.bodyWeightKg != null))
    ) {
      const effectiveSpeedKmh =
        typeof existing.speedKmh === "number" && Number.isFinite(existing.speedKmh) && existing.speedKmh > 0
          ? existing.speedKmh
          : parsed.speedKmh;
      const calorieFields = buildCaloriesUpdateOrCreate(
        existing.activityType,
        effectiveSpeedKmh,
        existing.durationSeconds,
        effectiveWeight,
        false
      );
      Object.assign(data, calorieFields);
    }
  }

  return data;
}

function buildTafUpdateData(
  existing: SheetTafAttemptInput,
  parsed: ParsedTafAttemptSheetRow,
  syncedAt: Date
): Record<string, unknown> {
  if (isProtectedTelemetrySource(existing.source)) {
    return {
      locationType: parsed.locationType,
      notes: parsed.notes,
      syncedToSheetsAt: syncedAt,
    };
  }

  return {
    testDate: parsed.testDate,
    locationType: parsed.locationType,
    targetDurationSeconds: parsed.targetDurationSeconds,
    actualDurationSeconds: parsed.actualDurationSeconds,
    distanceMeters: parsed.distanceMeters,
    speedKmh: parsed.speedKmh,
    paceSeconds: parsed.paceSeconds,
    paceFormatted: parsed.paceFormatted,
    notes: parsed.notes,
    syncedToSheetsAt: syncedAt,
  };
}

function buildMergedTafData(
  existing: SheetTafAttemptInput,
  parsed: ParsedTafAttemptSheetRow,
  syncedAt: Date
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    syncedToSheetsAt: syncedAt,
  };

  if (!existing.locationType && parsed.locationType) {
    data.locationType = parsed.locationType;
  }
  if (!existing.notes && parsed.notes) {
    data.notes = parsed.notes;
  }

  return data;
}

interface PullSheetContext<TDbItem> {
  onlyUnlinkedRows: boolean;
  now: () => Date;
  generateId: () => string;
  dbItems: TDbItem[];
  byId: Map<string, TDbItem>;
  linkedIds: Set<string>;
  warnings: SheetRowWarning[];
  idWritebacks: SheetUpdateEntry[];
}

async function pullTrainingSheetRows<T extends SheetTrainingSessionInput & { id: string }>(
  rows: unknown[][],
  ctx: PullSheetContext<T> & { fallbackWeightKg: number | null }
): Promise<{ updated: number; created: number; linked: number; skipped: number }> {
  let updated = 0;
  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isHeaderRow(row, i + 1) || isBlankSheetRow(row)) continue;
    const rawId = normalizeCellString(row[0]);
    if (rawId && ctx.byId.has(rawId)) {
      ctx.linkedIds.add(rawId);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;

    if (isHeaderRow(row, rowNumber) || isBlankSheetRow(row)) {
      continue;
    }
    if (ctx.onlyUnlinkedRows && normalizeCellString(row[0]).length > 0) {
      continue;
    }

    const parsedResult = parseTrainingRowFromSheet(row, rowNumber);
    if (!parsedResult.valid) {
      ctx.warnings.push({
        tab: SHEET_TABS.LOG_TREINOS,
        rowNumber,
        message: parsedResult.warning,
      });
      skipped += 1;
      continue;
    }

    for (const parserWarning of parsedResult.warnings) {
      ctx.warnings.push({
        tab: SHEET_TABS.LOG_TREINOS,
        rowNumber,
        message: parserWarning,
      });
    }

    const parsed = parsedResult.data;

    if (parsed.id) {
      const existing = ctx.byId.get(parsed.id);
      if (!existing) {
        ctx.warnings.push({
          tab: SHEET_TABS.LOG_TREINOS,
          rowNumber,
          message: `ID "${parsed.id}" não encontrado no banco (possível exclusão prévia). Linha ignorada sem ressuscitar registro.`,
        });
        skipped += 1;
        continue;
      }

      if (shouldProtectDirtyLocalRecord(existing)) {
        skipped += 1;
        continue;
      }

      if (!hasTrainingRowDivergence(existing, parsed)) {
        skipped += 1;
        continue;
      }

      const updateData = buildTrainingUpdateData(
        existing,
        parsed,
        ctx.now(),
        ctx.fallbackWeightKg
      );
      await prisma.trainingSession.update({
        where: { id: existing.id },
        data: updateData,
      });
      ctx.byId.set(existing.id, { ...existing, ...updateData } as T);
      updated += 1;
      continue;
    }

    const matched = findDeduplicatedTraining(ctx.dbItems, ctx.linkedIds, parsed);
    if (matched) {
      ctx.linkedIds.add(matched.id);
      await prisma.trainingSession.update({
        where: { id: matched.id },
        data: buildMergedTrainingData(matched, parsed, ctx.now(), ctx.fallbackWeightKg),
      });
      ctx.idWritebacks.push({
        range: `${SHEET_TABS.LOG_TREINOS}!A${rowNumber}`,
        values: [[matched.id]],
      });
      linked += 1;
      continue;
    }

    const newId = ctx.generateId();
    const calorieFields = buildCaloriesUpdateOrCreate(
      parsed.activityType,
      parsed.speedKmh,
      parsed.durationSeconds,
      parsed.bodyWeightKg ?? ctx.fallbackWeightKg
    );

    await prisma.trainingSession.create({
      data: {
        id: newId,
        source: "sheets",
        sessionDate: parsed.sessionDate,
        activityType: parsed.activityType,
        distanceKm: parsed.distanceKm,
        durationSeconds: parsed.durationSeconds,
        speedKmh: parsed.speedKmh,
        paceSeconds: parsed.paceSeconds,
        paceFormatted: parsed.paceFormatted,
        avgHeartRate: parsed.avgHeartRate,
        maxHeartRate: parsed.maxHeartRate,
        elevationGainM: parsed.elevationGainM,
        avgCadence: parsed.avgCadence,
        perceivedEffort: parsed.perceivedEffort,
        bodyWeightKg: parsed.bodyWeightKg,
        shoeName: parsed.shoeName,
        notes: parsed.notes,
        ...calorieFields,
        syncedToSheetsAt: ctx.now(),
      },
    });

    ctx.linkedIds.add(newId);
    ctx.idWritebacks.push({
      range: `${SHEET_TABS.LOG_TREINOS}!A${rowNumber}`,
      values: [[newId]],
    });
    created += 1;
  }

  return { updated, created, linked, skipped };
}

async function pullTafSheetRows<T extends SheetTafAttemptInput & { id: string }>(
  rows: unknown[][],
  ctx: PullSheetContext<T>
): Promise<{ updated: number; created: number; linked: number; skipped: number }> {
  let updated = 0;
  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isHeaderRow(row, i + 1) || isBlankSheetRow(row)) continue;
    const rawId = normalizeCellString(row[0]);
    if (rawId && ctx.byId.has(rawId)) {
      ctx.linkedIds.add(rawId);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;

    if (isHeaderRow(row, rowNumber) || isBlankSheetRow(row)) {
      continue;
    }
    if (ctx.onlyUnlinkedRows && normalizeCellString(row[0]).length > 0) {
      continue;
    }

    const parsedResult = parseTafAttemptRowFromSheet(row, rowNumber);
    if (!parsedResult.valid) {
      ctx.warnings.push({
        tab: SHEET_TABS.SIMULADOS_TAF,
        rowNumber,
        message: parsedResult.warning,
      });
      skipped += 1;
      continue;
    }

    const parsed = parsedResult.data;

    if (parsed.id) {
      const existing = ctx.byId.get(parsed.id);
      if (!existing) {
        ctx.warnings.push({
          tab: SHEET_TABS.SIMULADOS_TAF,
          rowNumber,
          message: `ID "${parsed.id}" não encontrado no banco (possível exclusão prévia). Linha ignorada sem ressuscitar registro.`,
        });
        skipped += 1;
        continue;
      }

      if (shouldProtectDirtyLocalRecord(existing)) {
        skipped += 1;
        continue;
      }

      if (!hasTafAttemptRowDivergence(existing, parsed)) {
        skipped += 1;
        continue;
      }

      const tafUpdateData = buildTafUpdateData(existing, parsed, ctx.now());
      await prisma.tafAttempt.update({
        where: { id: existing.id },
        data: tafUpdateData,
      });
      ctx.byId.set(existing.id, { ...existing, ...tafUpdateData } as T);
      updated += 1;
      continue;
    }

    const matched = findDeduplicatedAttempt(ctx.dbItems, ctx.linkedIds, parsed);
    if (matched) {
      ctx.linkedIds.add(matched.id);
      await prisma.tafAttempt.update({
        where: { id: matched.id },
        data: buildMergedTafData(matched, parsed, ctx.now()),
      });
      ctx.idWritebacks.push({
        range: `${SHEET_TABS.SIMULADOS_TAF}!A${rowNumber}`,
        values: [[matched.id]],
      });
      linked += 1;
      continue;
    }

    const newId = ctx.generateId();
    await prisma.tafAttempt.create({
      data: {
        id: newId,
        source: "sheets",
        testDate: parsed.testDate,
        locationType: parsed.locationType,
        targetDurationSeconds: parsed.targetDurationSeconds,
        actualDurationSeconds: parsed.actualDurationSeconds,
        distanceMeters: parsed.distanceMeters,
        speedKmh: parsed.speedKmh,
        paceSeconds: parsed.paceSeconds,
        paceFormatted: parsed.paceFormatted,
        notes: parsed.notes,
        syncedToSheetsAt: ctx.now(),
      },
    });

    ctx.linkedIds.add(newId);
    ctx.idWritebacks.push({
      range: `${SHEET_TABS.SIMULADOS_TAF}!A${rowNumber}`,
      values: [[newId]],
    });
    created += 1;
  }

  return { updated, created, linked, skipped };
}

/**
 * Executa a sincronização reversa (Google Sheets -> PostgreSQL):
 * atualiza registros existentes divergentes com proteção `.FIT`/`.GPX`, ignora IDs órfãos com aviso,
 * deduplica linhas manuais sem ID e cria novos registros com cálculo calórico + write-back de UUID na Coluna A.
 */
export async function pullChangesFromSheets(
  deps?: SheetsSyncDependencies,
  internalOpts?: PullInternalOptions
): Promise<PullChangesResult> {
  const { now, generateId } = resolveDeps(deps);
  const onlyUnlinkedRows = Boolean(internalOpts?.onlyUnlinkedRows);
  const { sheets, spreadsheetId } = getGoogleSheetsClient();

  await ensureSpreadsheetSchema(sheets, spreadsheetId, [
    SHEET_TABS.LOG_TREINOS,
    SHEET_TABS.SIMULADOS_TAF,
  ]);

  const [batchGetRes, dbTrainings, dbAttempts, profile, latestWeight] = await Promise.all([
    withSheetsRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [SHEET_RANGES.LOG_TREINOS_ALL, SHEET_RANGES.SIMULADOS_TAF_ALL],
        valueRenderOption: "FORMATTED_VALUE",
      })
    ),
    prisma.trainingSession.findMany({ orderBy: { sessionDate: "asc" } }),
    prisma.tafAttempt.findMany({ orderBy: { testDate: "asc" } }),
    prisma.userProfile.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.weightRecord.findFirst({ orderBy: { recordedAt: "desc" } }),
  ]);

  const fallbackWeightKg = resolveProfileWeightKg(profile, latestWeight);
  const warnings: SheetRowWarning[] = [];
  const idWritebacks: SheetUpdateEntry[] = [];
  const valueRanges = batchGetRes.data.valueRanges ?? [];

  const trainingCounts = await pullTrainingSheetRows(valueRanges[0]?.values ?? [], {
    onlyUnlinkedRows,
    now,
    generateId,
    dbItems: dbTrainings,
    byId: new Map(dbTrainings.map((item) => [item.id, item])),
    linkedIds: new Set<string>(),
    warnings,
    idWritebacks,
    fallbackWeightKg,
  });

  const tafCounts = await pullTafSheetRows(valueRanges[1]?.values ?? [], {
    onlyUnlinkedRows,
    now,
    generateId,
    dbItems: dbAttempts,
    byId: new Map(dbAttempts.map((item) => [item.id, item])),
    linkedIds: new Set<string>(),
    warnings,
    idWritebacks,
  });

  for (const chunk of chunkArray(idWritebacks, BATCH_CHUNK_SIZE)) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: chunk,
        },
      })
    );
  }

  return {
    pulledUpdated: trainingCounts.updated,
    pulledCreated: trainingCounts.created,
    pulledLinked: trainingCounts.linked,
    tafPulledUpdated: tafCounts.updated,
    tafPulledCreated: tafCounts.created,
    tafPulledLinked: tafCounts.linked,
    skipped: trainingCounts.skipped + tafCounts.skipped,
    warnings,
  };
}

export interface WeeklyPlanRowSnapshot {
  rowNumber: number;
  statusText: string;
  matchedSessionIdText: string;
}

export interface PullWeeklyPlanResult {
  stats: Pick<WeeklyPlanSyncStats, "imported" | "updated" | "removed" | "sheetMissingOrEmpty">;
  parsedCount: number;
  sheetMissing: boolean;
  warnings: SheetRowWarning[];
  sheetSnapshots: Map<string, WeeklyPlanRowSnapshot>;
}

export interface ReconcileWeeklyPlanResult {
  matched: number;
  missed: number;
  updatedCount: number;
}

export interface PushWeeklyPlanResult {
  pushed: number;
  sheetMissingOrEmpty: boolean;
}

async function readWeeklyPlanSheetRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<{ sheetMissing: boolean; rows: unknown[][] }> {
  try {
    const res = await withSheetsRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: SHEET_RANGES.PLANO_SEMANAL_DATA,
        valueRenderOption: "FORMATTED_VALUE",
      })
    );
    return {
      sheetMissing: false,
      rows: res.data.values ?? [],
    };
  } catch (error) {
    if (isMissingTabError(error)) {
      return {
        sheetMissing: true,
        rows: [],
      };
    }
    throw error;
  }
}

function collectWeeklyPlanSheetSnapshots(
  rows: unknown[][]
): Map<string, WeeklyPlanRowSnapshot> {
  const snapshots = new Map<string, WeeklyPlanRowSnapshot>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isBlankSheetRow(row) || isRestPlanActivity(row[3])) {
      continue;
    }

    const planExternalId = normalizeCellString(row[0]);
    if (!planExternalId || snapshots.has(planExternalId)) {
      continue;
    }

    // Alinha com pullWeeklyPlanFromSheets para que linhas duplicadas com 1ª ocorrência de data inválida não capturem o snapshot.
    if (!parseSheetDate(row[1])) {
      continue;
    }

    snapshots.set(planExternalId, {
      rowNumber: i + 2,
      statusText: normalizeCellString(row[7]),
      matchedSessionIdText: normalizeCellString(row[8]),
    });
  }

  return snapshots;
}

function hasWeeklyPlanPrescriptionDivergence(
  existing: {
    plannedDate: Date;
    dayOfWeek: string;
    activityType: string;
    targetDistanceKm: number | null;
    targetPaceFormatted: string | null;
    description: string | null;
  },
  parsed: ParsedWeeklyPlanSheetRow
): boolean {
  if (toFortalezaDateKey(existing.plannedDate) !== toFortalezaDateKey(parsed.plannedDate)) {
    return true;
  }
  if (existing.dayOfWeek !== parsed.dayOfWeek || existing.activityType !== parsed.activityType) {
    return true;
  }

  const existingDistNull = existing.targetDistanceKm == null;
  const parsedDistNull = parsed.targetDistanceKm == null;
  if (existingDistNull !== parsedDistNull) {
    return true;
  }
  if (
    !existingDistNull &&
    !parsedDistNull &&
    Math.abs((existing.targetDistanceKm as number) - (parsed.targetDistanceKm as number)) > 1e-6
  ) {
    return true;
  }

  if ((existing.targetPaceFormatted ?? null) !== (parsed.targetPaceFormatted ?? null)) {
    return true;
  }
  if ((existing.description ?? null) !== (parsed.description ?? null)) {
    return true;
  }

  return false;
}

/**
 * Lê a aba opcional `Plano_Semanal!A2:I` sem erro se estiver ausente ou vazia,
 * sincronizando prescrições (colunas A-G) com o PostgreSQL e limpando pendências
 * não concluídas de semanas regeneradas ou linhas removidas.
 */
export async function pullWeeklyPlanFromSheets(
  deps?: SheetsSyncDependencies
): Promise<PullWeeklyPlanResult> {
  const { generateId } = resolveDeps(deps);
  const { sheets, spreadsheetId } = getGoogleSheetsClient();
  const { sheetMissing, rows } = await readWeeklyPlanSheetRows(sheets, spreadsheetId);

  if (sheetMissing) {
    return {
      stats: {
        imported: 0,
        updated: 0,
        removed: 0,
        sheetMissingOrEmpty: true,
      },
      parsedCount: 0,
      sheetMissing: true,
      warnings: [],
      sheetSnapshots: new Map(),
    };
  }

  const warnings: SheetRowWarning[] = [];
  const parsedItems: ParsedWeeklyPlanSheetRow[] = [];
  const seenPlanIds = new Set<string>();
  const pulledWeekStarts = new Set<string>();
  const sheetSnapshots = new Map<string, WeeklyPlanRowSnapshot>();
  let nonBlankRowsCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 2;
    if (isBlankSheetRow(row)) {
      continue;
    }

    nonBlankRowsCount += 1;
    const parsed = parseWeeklyPlanRowFromSheet(row, rowNumber);

    if (!parsed.valid) {
      warnings.push({
        tab: SHEET_TABS.PLANO_SEMANAL,
        rowNumber,
        message: parsed.warning,
      });
      continue;
    }

    if (parsed.kind === "rest") {
      const restDate = parseSheetDate(row[1]);
      if (restDate) {
        pulledWeekStarts.add(getFortalezaWeekBounds(restDate).weekStart);
      }
      continue;
    }

    for (const warningMsg of parsed.warnings) {
      warnings.push({
        tab: SHEET_TABS.PLANO_SEMANAL,
        rowNumber,
        message: warningMsg,
      });
    }

    if (seenPlanIds.has(parsed.data.planExternalId)) {
      warnings.push({
        tab: SHEET_TABS.PLANO_SEMANAL,
        rowNumber,
        message: `Linha ${rowNumber} (Plano_Semanal): ID "${parsed.data.planExternalId}" duplicado na planilha; cópia ignorada.`,
      });
      continue;
    }

    seenPlanIds.add(parsed.data.planExternalId);
    pulledWeekStarts.add(getFortalezaWeekBounds(parsed.data.plannedDate).weekStart);
    sheetSnapshots.set(parsed.data.planExternalId, {
      rowNumber,
      statusText: normalizeCellString(row[7]),
      matchedSessionIdText: normalizeCellString(row[8]),
    });
    parsedItems.push(parsed.data);
  }

  const existingPlans = await prisma.weeklyPlanItem.findMany();
  const existingByExternalId = new Map(
    existingPlans.map((item) => [item.planExternalId, item])
  );

  let imported = 0;
  let updated = 0;
  let removed = 0;

  for (const item of parsedItems) {
    const existing = existingByExternalId.get(item.planExternalId);
    if (!existing) {
      await prisma.weeklyPlanItem.create({
        data: {
          id: generateId(),
          planExternalId: item.planExternalId,
          plannedDate: item.plannedDate,
          dayOfWeek: item.dayOfWeek,
          activityType: item.activityType,
          targetDistanceKm: item.targetDistanceKm,
          targetPaceFormatted: item.targetPaceFormatted,
          description: item.description,
          status: "Planejado",
          matchedSessionId: null,
        },
      });
      imported += 1;
      continue;
    }

    if (hasWeeklyPlanPrescriptionDivergence(existing, item)) {
      await prisma.weeklyPlanItem.update({
        where: { id: existing.id },
        data: {
          plannedDate: item.plannedDate,
          dayOfWeek: item.dayOfWeek,
          activityType: item.activityType,
          targetDistanceKm: item.targetDistanceKm,
          targetPaceFormatted: item.targetPaceFormatted,
          description: item.description,
        },
      });
      updated += 1;
    }
  }

  if (parsedItems.length > 0 || pulledWeekStarts.size > 0) {
    const idsToDelete: string[] = [];

    for (const existing of existingPlans) {
      if (seenPlanIds.has(existing.planExternalId)) continue;
      if (existing.matchedSessionId !== null) continue;
      if (existing.status === "Concluído" || existing.status === "Parcial") continue;

      const existingWeekKey = getFortalezaWeekBounds(existing.plannedDate).weekStart;
      const isPlannedUnlinked = existing.status === "Planejado";
      const isMissedInPulledWeek =
        existing.status === "Perdido" && pulledWeekStarts.has(existingWeekKey);

      if (isPlannedUnlinked || isMissedInPulledWeek) {
        idsToDelete.push(existing.id);
      }
    }

    if (idsToDelete.length > 0) {
      const deleteResult = await prisma.weeklyPlanItem.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      removed = deleteResult.count ?? idsToDelete.length;
    }
  }

  return {
    stats: {
      imported,
      updated,
      removed,
      sheetMissingOrEmpty: nonBlankRowsCount === 0,
    },
    parsedCount: parsedItems.length,
    sheetMissing: false,
    warnings,
    sheetSnapshots,
  };
}

function isRetryableReconciliationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2025")
  );
}

/**
 * Reconcilia `WeeklyPlanItem` e `TrainingSession` 100% localmente no PostgreSQL:
 * reverte vínculos órfãos pós-`DELETE`, revalida sessões editadas (`PUT`),
 * executa reconciliação em 2 passadas e persiste alterações em transação atômica.
 */
export async function reconcileWeeklyPlansWithSessions(
  options: { editedSessionId?: string; now?: Date } = {},
  deps?: SheetsSyncDependencies
): Promise<ReconcileWeeklyPlanResult> {
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await runReconcileWeeklyPlansOnce(options, deps);
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isRetryableReconciliationConflict(error)) {
        continue;
      }
      throw error;
    }
  }
  return { matched: 0, missed: 0, updatedCount: 0 };
}

async function runReconcileWeeklyPlansOnce(
  options: { editedSessionId?: string; now?: Date } = {},
  deps?: SheetsSyncDependencies
): Promise<ReconcileWeeklyPlanResult> {
  const referenceNow = options.now ?? resolveDeps(deps).now();
  const todayFortalezaKey = toFortalezaDateKey(referenceNow);
  if (!todayFortalezaKey) {
    return { matched: 0, missed: 0, updatedCount: 0 };
  }

  const allPlans = await prisma.weeklyPlanItem.findMany({
    orderBy: [{ plannedDate: "asc" }, { planExternalId: "asc" }],
  });

  if (allPlans.length === 0) {
    return { matched: 0, missed: 0, updatedCount: 0 };
  }

  const linkedSessionIds = Array.from(
    new Set(
      allPlans
        .map((plan) => plan.matchedSessionId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  const sessions = await prisma.trainingSession.findMany({
    where: {
      OR: [
        { weeklyPlanItem: { is: null } },
        ...(linkedSessionIds.length > 0 ? [{ id: { in: linkedSessionIds } }] : []),
        ...(options.editedSessionId ? [{ id: options.editedSessionId }] : []),
      ],
    },
    select: {
      id: true,
      sessionDate: true,
      activityType: true,
      distanceKm: true,
      durationSeconds: true,
    },
    orderBy: { sessionDate: "asc" },
  });

  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const occupiedPlanDateKeys = new Set<string>();
  const unlinkedPlanDateKeys = new Set<string>();
  for (const plan of allPlans) {
    if (isRestPlanActivity(plan.activityType)) continue;
    const key = toFortalezaDateKey(plan.plannedDate);
    if (key) {
      occupiedPlanDateKeys.add(key);
      if (plan.matchedSessionId === null) {
        unlinkedPlanDateKeys.add(key);
      }
    }
  }

  const workingPlans = allPlans.map((plan) => ({
    id: plan.id,
    planExternalId: plan.planExternalId,
    plannedDate: plan.plannedDate,
    activityType: plan.activityType,
    targetDistanceKm: plan.targetDistanceKm,
    status: plan.status,
    matchedSessionId: plan.matchedSessionId,
  }));

  const currentlyLinkedSessionIds = new Set<string>();

  for (const plan of workingPlans) {
    if (isRestPlanActivity(plan.activityType)) {
      continue;
    }

    if (plan.matchedSessionId === null) {
      if (plan.status === "Concluído" || plan.status === "Parcial") {
        plan.status = computeUnmatchedPlanStatus(plan.plannedDate, todayFortalezaKey);
      }
      continue;
    }

    const linkedSession = sessionsById.get(plan.matchedSessionId);
    if (!linkedSession) {
      plan.matchedSessionId = null;
      plan.status = computeUnmatchedPlanStatus(plan.plannedDate, todayFortalezaKey);
      continue;
    }

    // Quando a sessão foi recém-editada (`PUT`) e há outro plano livre na mesma data,
    // libera temporariamente o vínculo em memória para recomparar competitivamente na Passada 1.
    const editedSessionDateKey = toFortalezaDateKey(linkedSession.sessionDate);
    if (
      options.editedSessionId &&
      linkedSession.id === options.editedSessionId &&
      Boolean(editedSessionDateKey && unlinkedPlanDateKeys.has(editedSessionDateKey))
    ) {
      plan.matchedSessionId = null;
      plan.status = computeUnmatchedPlanStatus(plan.plannedDate, todayFortalezaKey);
      continue;
    }

    const validity = evaluateLinkedSessionValidity(plan, linkedSession, {
      occupiedPlanDateKeys,
    });
    if (!validity.valid || !validity.nextStatus) {
      plan.matchedSessionId = null;
      plan.status = computeUnmatchedPlanStatus(plan.plannedDate, todayFortalezaKey);
      continue;
    }

    plan.status = validity.nextStatus;
    currentlyLinkedSessionIds.add(linkedSession.id);
  }

  const freeSessions = sessions.filter((session) => !currentlyLinkedSessionIds.has(session.id));
  const reconciliation = computeWeeklyReconciliation(
    workingPlans,
    freeSessions,
    todayFortalezaKey,
    { occupiedPlanDateKeys }
  );

  const workingById = new Map(workingPlans.map((plan) => [plan.id, plan]));
  for (const match of reconciliation.matches) {
    const target = workingById.get(match.planId);
    if (target) {
      target.status = match.status;
      target.matchedSessionId = match.sessionId;
    }
  }

  for (const change of reconciliation.unmatchedUpdates) {
    const target = workingById.get(change.planId);
    if (target) {
      target.status = change.nextStatus;
    }
  }

  const changedPairs = allPlans
    .map((orig) => {
      const next = workingById.get(orig.id);
      if (!next) return null;
      if (
        next.status === orig.status &&
        (next.matchedSessionId ?? null) === (orig.matchedSessionId ?? null)
      ) {
        return null;
      }
      return { orig, next };
    })
    .filter(
      (
        entry
      ): entry is {
        orig: (typeof allPlans)[number];
        next: (typeof workingPlans)[number];
      } => entry !== null
    );

  if (changedPairs.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Phase 1: liberar matchedSessionId antigos antes de vincular novos para evitar colisão @unique
      for (const { orig, next } of changedPairs) {
        if (orig.matchedSessionId !== null && next.matchedSessionId !== orig.matchedSessionId) {
          if (next.matchedSessionId === null) {
            await tx.weeklyPlanItem.update({
              where: { id: next.id },
              data: {
                status: next.status,
                matchedSessionId: null,
              },
            });
          } else {
            await tx.weeklyPlanItem.update({
              where: { id: next.id },
              data: {
                matchedSessionId: null,
              },
            });
          }
        }
      }

      // Phase 2: aplicar estado final (status e/ou novo vínculo matchedSessionId)
      for (const { orig, next } of changedPairs) {
        if (orig.matchedSessionId !== null && next.matchedSessionId === null) {
          continue;
        }
        await tx.weeklyPlanItem.update({
          where: { id: next.id },
          data: {
            status: next.status,
            matchedSessionId: next.matchedSessionId,
          },
        });
      }
    });
  }

  return {
    matched: reconciliation.matches.length,
    missed: reconciliation.missedCount,
    updatedCount: changedPairs.length,
  };
}

/**
 * Grava apenas as colunas `H:I` (`Status` e `ID Treino Realizado`) na aba `Plano_Semanal`,
 * exclusivamente para linhas cuja situação atual no Sheets diverge do PostgreSQL.
 */
export async function pushWeeklyPlanStatusToSheets(
  deps?: SheetsSyncDependencies,
  cachedSheetContext?: {
    sheetMissing: boolean;
    sheetSnapshots: Map<string, WeeklyPlanRowSnapshot>;
  }
): Promise<PushWeeklyPlanResult> {
  if (cachedSheetContext?.sheetMissing) {
    return { pushed: 0, sheetMissingOrEmpty: true };
  }

  const plans = await prisma.weeklyPlanItem.findMany({
    orderBy: [{ plannedDate: "asc" }, { planExternalId: "asc" }],
  });

  if (plans.length === 0) {
    return {
      pushed: 0,
      sheetMissingOrEmpty: cachedSheetContext ? cachedSheetContext.sheetSnapshots.size === 0 : true,
    };
  }

  const { sheets, spreadsheetId } = getGoogleSheetsClient();
  let snapshots: Map<string, WeeklyPlanRowSnapshot>;

  if (cachedSheetContext) {
    snapshots = cachedSheetContext.sheetSnapshots;
  } else {
    const { sheetMissing, rows } = await readWeeklyPlanSheetRows(sheets, spreadsheetId);
    if (sheetMissing) {
      return { pushed: 0, sheetMissingOrEmpty: true };
    }
    snapshots = collectWeeklyPlanSheetSnapshots(rows);
  }

  if (snapshots.size === 0) {
    return { pushed: 0, sheetMissingOrEmpty: true };
  }

  const updateEntries: SheetUpdateEntry[] = [];
  for (const plan of plans) {
    const snapshot = snapshots.get(plan.planExternalId);
    if (!snapshot) continue;

    const desiredStatus = plan.status;
    const desiredMatchedId = plan.matchedSessionId ?? "";
    if (
      snapshot.statusText === desiredStatus &&
      snapshot.matchedSessionIdText === desiredMatchedId
    ) {
      continue;
    }

    updateEntries.push({
      range: `${SHEET_TABS.PLANO_SEMANAL}!H${snapshot.rowNumber}:I${snapshot.rowNumber}`,
      values: [[desiredStatus, desiredMatchedId]],
    });
  }

  for (const chunk of chunkArray(updateEntries, BATCH_CHUNK_SIZE)) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: chunk,
        },
      })
    );
  }

  return {
    pushed: updateEntries.length,
    sheetMissingOrEmpty: false,
  };
}

/**
 * Executa o fluxo completo dedicado do Plano Semanal:
 * `pullWeeklyPlanFromSheets` -> `reconcileWeeklyPlansWithSessions` -> `pushWeeklyPlanStatusToSheets`.
 */
export async function syncWeeklyPlanFromSheets(
  deps?: SheetsSyncDependencies
): Promise<WeeklyPlanStandaloneSyncResult> {
  const pullRes = await pullWeeklyPlanFromSheets(deps);
  const reconcileRes = await reconcileWeeklyPlansWithSessions(undefined, deps);
  const pushRes = await pushWeeklyPlanStatusToSheets(deps, {
    sheetMissing: pullRes.sheetMissing,
    sheetSnapshots: pullRes.sheetSnapshots,
  });

  return {
    imported: pullRes.stats.imported,
    updated: pullRes.stats.updated,
    removed: pullRes.stats.removed,
    matched: reconcileRes.matched,
    missed: reconcileRes.missed,
    pushed: pushRes.pushed,
    sheetMissingOrEmpty: pullRes.stats.sheetMissingOrEmpty,
    syncedPlans: pullRes.parsedCount,
  };
}

/**
 * Retorna o status leve da integração Google Sheets e a contagem de treinos e simulados
 * pendentes de sincronização no PostgreSQL, sem consumir quota da Google API.
 */
export async function getSheetsSyncStatus(): Promise<SheetsSyncStatus> {
  const envConfig = getGoogleSheetsEnvConfig();

  const [trainings, attempts] = await Promise.all([
    prisma.trainingSession.findMany({
      select: {
        syncedToSheetsAt: true,
        updatedAt: true,
      },
    }),
    prisma.tafAttempt.findMany({
      select: {
        syncedToSheetsAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const pendingTrainingsCount = trainings.filter((session) =>
    isDirtyRecord(session.syncedToSheetsAt, session.updatedAt)
  ).length;
  const pendingAttemptsCount = attempts.filter((attempt) =>
    isDirtyRecord(attempt.syncedToSheetsAt, attempt.updatedAt)
  ).length;

  return {
    configured: envConfig.isConfigured,
    ...(envConfig.isConfigured ? {} : { error: envConfig.error }),
    pendingTrainingsCount,
    pendingAttemptsCount,
    totalPendingCount: pendingTrainingsCount + pendingAttemptsCount,
  };
}

/**
 * Orquestrador principal de sincronização (`bidirectional`, `push` ou `pull`).
 */
export async function syncWithGoogleSheets(
  options: SheetsSyncOptions = {},
  deps?: SheetsSyncDependencies
): Promise<SheetsSyncReport> {
  const { now } = resolveDeps(deps);
  const direction: SheetsSyncDirection = options.direction ?? "bidirectional";
  const forceFullResync = Boolean(options.forceFullResync);
  const startedAtMs = Date.now();

  let pullResult: PullChangesResult = {
    pulledUpdated: 0,
    pulledCreated: 0,
    pulledLinked: 0,
    tafPulledUpdated: 0,
    tafPulledCreated: 0,
    tafPulledLinked: 0,
    skipped: 0,
    warnings: [],
  };

  let pushResult: HistoricalBackfillResult = {
    pushedAppended: 0,
    pushedUpdated: 0,
    tafPushedAppended: 0,
    tafPushedUpdated: 0,
    profileSynced: false,
    syncedAt: now(),
  };

  let weeklyPlanStats: WeeklyPlanSyncStats = {
    imported: 0,
    updated: 0,
    removed: 0,
    matched: 0,
    missed: 0,
    pushed: 0,
    sheetMissingOrEmpty: true,
  };

  if (direction === "pull") {
    pullResult = await pullChangesFromSheets(deps);
    const weeklyPull = await pullWeeklyPlanFromSheets(deps);
    const weeklyReconcile = await reconcileWeeklyPlansWithSessions(undefined, deps);
    const weeklyPush = await pushWeeklyPlanStatusToSheets(deps, {
      sheetMissing: weeklyPull.sheetMissing,
      sheetSnapshots: weeklyPull.sheetSnapshots,
    });
    pullResult.warnings.push(...weeklyPull.warnings);
    weeklyPlanStats = {
      imported: weeklyPull.stats.imported,
      updated: weeklyPull.stats.updated,
      removed: weeklyPull.stats.removed,
      matched: weeklyReconcile.matched,
      missed: weeklyReconcile.missed,
      pushed: weeklyPush.pushed,
      sheetMissingOrEmpty: weeklyPull.stats.sheetMissingOrEmpty,
    };
  } else if (direction === "push") {
    pushResult = await syncHistoricalDataToSheets({ forceFullResync }, deps);
    const weeklyReconcile = await reconcileWeeklyPlansWithSessions(undefined, deps);
    const weeklyPush = await pushWeeklyPlanStatusToSheets(deps);
    weeklyPlanStats = {
      imported: 0,
      updated: 0,
      removed: 0,
      matched: weeklyReconcile.matched,
      missed: weeklyReconcile.missed,
      pushed: weeklyPush.pushed,
      sheetMissingOrEmpty: weeklyPush.sheetMissingOrEmpty,
    };
  } else {
    pullResult = await pullChangesFromSheets(deps, {
      onlyUnlinkedRows: forceFullResync,
    });
    const weeklyPull = await pullWeeklyPlanFromSheets(deps);
    const weeklyReconcile = await reconcileWeeklyPlansWithSessions(undefined, deps);
    pushResult = await syncHistoricalDataToSheets({ forceFullResync }, deps);
    const weeklyPush = await pushWeeklyPlanStatusToSheets(deps, {
      sheetMissing: weeklyPull.sheetMissing,
      sheetSnapshots: weeklyPull.sheetSnapshots,
    });
    pullResult.warnings.push(...weeklyPull.warnings);
    weeklyPlanStats = {
      imported: weeklyPull.stats.imported,
      updated: weeklyPull.stats.updated,
      removed: weeklyPull.stats.removed,
      matched: weeklyReconcile.matched,
      missed: weeklyReconcile.missed,
      pushed: weeklyPush.pushed,
      sheetMissingOrEmpty: weeklyPull.stats.sheetMissingOrEmpty,
    };
  }

  const completedAt = direction === "pull" ? now() : pushResult.syncedAt;

  return {
    direction,
    forceFullResync,
    pulledUpdated: pullResult.pulledUpdated,
    pulledCreated: pullResult.pulledCreated,
    pulledLinked: pullResult.pulledLinked,
    pushedAppended: pushResult.pushedAppended,
    pushedUpdated: pushResult.pushedUpdated,
    tafPulledUpdated: pullResult.tafPulledUpdated,
    tafPulledCreated: pullResult.tafPulledCreated,
    tafPulledLinked: pullResult.tafPulledLinked,
    tafPushedAppended: pushResult.tafPushedAppended,
    tafPushedUpdated: pushResult.tafPushedUpdated,
    profileSynced: pushResult.profileSynced,
    weeklyPlan: weeklyPlanStats,
    skipped: pullResult.skipped,
    warnings: pullResult.warnings,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    syncedAt: completedAt.toISOString(),
  };
}

/**
 * Wrapper seguro para hooks de sincronização automática em rotas REST/Serverless.
 * Faz short-circuit em 0ms quando a integração não está configurada e captura falhas
 * externas para nunca derrubar operações locais do usuário.
 */
export async function safeAutoSync<T = unknown>(
  fn: () => Promise<T>
): Promise<SafeAutoSyncResult<T>> {
  if (!isGoogleSheetsConfigured()) {
    return {
      skipped: true,
      ok: true,
    };
  }

  try {
    const data = await fn();
    const rawSyncedAt =
      data && typeof data === "object" && "syncedAt" in data
        ? (data as { syncedAt?: unknown }).syncedAt
        : undefined;
    const syncedAt =
      rawSyncedAt instanceof Date
        ? rawSyncedAt.toISOString()
        : typeof rawSyncedAt === "string"
          ? rawSyncedAt
          : new Date().toISOString();

    return {
      skipped: false,
      ok: true,
      syncedAt,
      data,
    };
  } catch (error) {
    console.error("[SheetsSync]", error);
    return {
      skipped: false,
      ok: false,
      syncedAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
