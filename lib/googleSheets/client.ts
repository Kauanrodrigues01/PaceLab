import { sheets as createGoogleSheetsApi, sheets_v4 } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";
import { getGoogleSheetsEnvConfig } from "@/lib/env";
import { SheetTabName } from "@/lib/googleSheets/types";

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

const RETRYABLE_HTTP_STATUSES = new Set([429, 503]);

/**
 * Erro controlado lançado apenas quando uma operação do Google Sheets é invocada
 * sem as variáveis de ambiente obrigatórias ou com credenciais malformadas.
 */
export class GoogleSheetsNotConfiguredError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "Integração com Google Sheets não configurada. Defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64 conforme o README.md."
    );
    this.name = "GoogleSheetsNotConfiguredError";
  }
}

export interface SheetsClientBundle {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  clientEmail: string;
}

export type SheetsClientFactory = (params: {
  auth: GoogleAuth;
  spreadsheetId: string;
  clientEmail: string;
}) => SheetsClientBundle;

export interface GetGoogleSheetsClientOptions {
  bypassCache?: boolean;
  factory?: SheetsClientFactory;
}

export interface SheetsRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

let cachedClientEntry: {
  cacheKey: string;
  bundle: SheetsClientBundle;
} | null = null;

/**
 * Limpa o cache em memória do cliente Google Sheets (útil para testes e rotação de ambiente).
 */
export function resetGoogleSheetsClientCache(): void {
  cachedClientEntry = null;
}

/**
 * Inicializa o cliente leve `@googleapis/sheets` (v4) autenticado com `GoogleAuth`
 * a partir de `GOOGLE_CREDENTIALS_BASE64` e `GOOGLE_SHEETS_SPREADSHEET_ID`.
 */
export function getGoogleSheetsClient(
  options: GetGoogleSheetsClientOptions = {}
): SheetsClientBundle {
  const envConfig = getGoogleSheetsEnvConfig();

  if (!envConfig.isConfigured || !envConfig.credentials || !envConfig.spreadsheetId) {
    throw new GoogleSheetsNotConfiguredError(envConfig.error);
  }

  const { credentials, spreadsheetId } = envConfig;
  const cacheKey = `${spreadsheetId}::${credentials.client_email}::${credentials.private_key}`;

  if (!options.bypassCache && !options.factory && cachedClientEntry?.cacheKey === cacheKey) {
    return cachedClientEntry.bundle;
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [...GOOGLE_SHEETS_SCOPES],
  });

  const bundle: SheetsClientBundle = options.factory
    ? options.factory({
        auth,
        spreadsheetId,
        clientEmail: credentials.client_email,
      })
    : {
        sheets: createGoogleSheetsApi({
          version: "v4",
          auth: auth as unknown as sheets_v4.Options["auth"],
        }),
        spreadsheetId,
        clientEmail: credentials.client_email,
      };

  if (!options.bypassCache && !options.factory) {
    cachedClientEntry = { cacheKey, bundle };
  }

  return bundle;
}

/**
 * Extrai o código HTTP de erros retornados por `gaxios` / Google APIs.
 */
export function extractGoogleApiStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };

  if (typeof record.response?.status === "number") {
    return record.response.status;
  }
  if (typeof record.status === "number") {
    return record.status;
  }
  if (typeof record.code === "number") {
    return record.code;
  }

  return undefined;
}

/**
 * Indica se o erro HTTP é transitório de limite de quota (`429`) ou indisponibilidade (`503`).
 */
export function isRetryableGoogleError(error: unknown): boolean {
  const status = extractGoogleApiStatus(error);
  return status !== undefined && RETRYABLE_HTTP_STATUSES.has(status);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma operação na Google Sheets API com retry exponencial curto
 * apenas para erros transitórios (`429` e `503`), respeitando timeouts serverless.
 */
export async function withSheetsRetry<T>(
  operation: () => Promise<T>,
  options: SheetsRetryOptions = {}
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableGoogleError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      attempt += 1;
      await sleep(delayMs);
    }
  }
}

/**
 * Obtém o mapa `título da aba -> sheetId numérico` da planilha configurada.
 */
export async function getSheetIdsMap(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  retryOptions?: SheetsRetryOptions
): Promise<Map<string, number>> {
  const response = await withSheetsRetry(
    () =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title))",
      }),
    retryOptions
  );

  const map = new Map<string, number>();
  const sheetList = response.data.sheets ?? [];

  for (const sheet of sheetList) {
    const title = sheet.properties?.title?.trim();
    const sheetId = sheet.properties?.sheetId;
    if (title && typeof sheetId === "number") {
      map.set(title, sheetId);
    }
  }

  return map;
}

/**
 * Resolve o `sheetId` numérico de uma aba específica pelo nome (exato ou case-insensitive).
 */
export async function getSheetIdByTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: SheetTabName | string,
  retryOptions?: SheetsRetryOptions
): Promise<number> {
  const idsMap = await getSheetIdsMap(sheets, spreadsheetId, retryOptions);

  const exactMatch = idsMap.get(tabName);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  const normalizedTarget = tabName.trim().toLowerCase();
  for (const [title, sheetId] of Array.from(idsMap.entries())) {
    if (title.toLowerCase() === normalizedTarget) {
      return sheetId;
    }
  }

  throw new Error(`Aba "${tabName}" não encontrada na planilha "${spreadsheetId}".`);
}
