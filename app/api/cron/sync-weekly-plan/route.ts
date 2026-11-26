import crypto from "node:crypto";
import {
  apiError,
  apiServiceUnavailable,
  apiSuccess,
  withApiHandler,
} from "@/lib/api/response";
import { mapSheetsUpstreamError } from "@/lib/api/sheetsSync";
import { getGoogleSheetsEnvConfig } from "@/lib/env";
import { syncWithGoogleSheets } from "@/lib/googleSheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sha256Digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function isValidBearerToken(authHeader: string | null, expectedSecret: string): boolean {
  if (!authHeader) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match?.[1]) return false;

  const providedHash = sha256Digest(match[1].trim());
  const expectedHash = sha256Digest(expectedSecret);
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

/**
 * Endpoint acionado pelo Vercel Cron toda segunda-feira às 01:00 UTC
 * (domingo às 22:00 em `America/Fortaleza`) para sincronizar o novo plano semanal,
 * reconciliar os treinos realizados da semana (respeitando a janela D+1 de sábado/domingo)
 * e gravar `Plano_Semanal!H:I`.
 */
export async function GET(request: Request) {
  return withApiHandler(async () => {
    const expectedSecret = process.env.CRON_SECRET?.trim();
    if (!expectedSecret) {
      return apiServiceUnavailable(
        "CRON_SECRET não configurada no ambiente. Defina CRON_SECRET para habilitar a sincronização agendada.",
        { code: "CRON_SECRET_NOT_CONFIGURED" },
        "CRON_SECRET_NOT_CONFIGURED"
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!isValidBearerToken(authHeader, expectedSecret)) {
      const response = apiError(
        "Não autorizado para executar a sincronização agendada.",
        401,
        { code: "UNAUTHORIZED" },
        "UNAUTHORIZED"
      );
      response.headers.set("WWW-Authenticate", 'Bearer realm="PaceLab Cron"');
      return response;
    }

    const envConfig = getGoogleSheetsEnvConfig();
    if (!envConfig.isConfigured) {
      return apiServiceUnavailable(
        envConfig.error ||
          "Integração com Google Sheets não configurada. Defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64.",
        { code: "SHEETS_NOT_CONFIGURED" },
        "SHEETS_NOT_CONFIGURED"
      );
    }

    try {
      const report = await syncWithGoogleSheets({
        direction: "bidirectional",
        forceFullResync: false,
      });
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
