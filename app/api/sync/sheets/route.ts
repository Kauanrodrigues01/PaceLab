import { NextResponse } from "next/server";
import { apiError, apiSuccess, ApiResponse, withApiHandler } from "@/lib/api/response";
import { getGoogleSheetsEnvConfig } from "@/lib/env";
import {
  extractGoogleApiStatus,
  getSheetsSyncStatus,
  GoogleSheetsNotConfiguredError,
  syncWithGoogleSheets,
} from "@/lib/googleSheets";
import { SheetsSyncRequestSchema } from "@/lib/validations/taf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapSheetsUpstreamError(
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

export async function GET() {
  return withApiHandler(async () => {
    const status = await getSheetsSyncStatus();
    return apiSuccess(status, 200);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const rawText = await request.text();
    let rawBody: unknown = {};

    if (rawText.trim().length > 0) {
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        return apiError("Corpo da requisição JSON inválido.", 400);
      }
    }

    const validated = SheetsSyncRequestSchema.parse(rawBody);
    const envConfig = getGoogleSheetsEnvConfig();

    if (!envConfig.isConfigured) {
      return apiError(
        envConfig.error ||
          "Integração com Google Sheets não configurada. Defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64 conforme o README.md.",
        503,
        { code: "SHEETS_NOT_CONFIGURED" }
      );
    }

    try {
      const report = await syncWithGoogleSheets(validated);
      return apiSuccess(report, 200);
    } catch (error) {
      const mapped = mapSheetsUpstreamError(error);
      if (mapped) {
        return mapped;
      }
      throw error;
    }
  });
}
