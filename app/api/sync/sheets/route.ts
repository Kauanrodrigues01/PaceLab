import {
  apiServiceUnavailable,
  apiSuccess,
  withApiHandler,
} from "@/lib/api/response";
import { parseOptionalJsonBody } from "@/lib/api/request";
import { mapSheetsUpstreamError } from "@/lib/api/sheetsSync";
import { getGoogleSheetsEnvConfig } from "@/lib/env";
import {
  getSheetsSyncStatus,
  syncWithGoogleSheets,
} from "@/lib/googleSheets";
import { SheetsSyncRequestSchema } from "@/lib/validations/taf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const status = await getSheetsSyncStatus();
    return apiSuccess(status, 200);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const { data: validated } = await parseOptionalJsonBody(
      request,
      SheetsSyncRequestSchema
    );
    const envConfig = getGoogleSheetsEnvConfig();

    if (!envConfig.isConfigured) {
      return apiServiceUnavailable(
        envConfig.error ||
          "Integração com Google Sheets não configurada. Defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64 conforme o README.md.",
        { code: "SHEETS_NOT_CONFIGURED" },
        "SHEETS_NOT_CONFIGURED"
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
