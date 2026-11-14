/**
 * Utilitário central de validação de ambiente (Fail-Fast e Diagnóstico do Banco)
 * PaceLab - Arquitetura Segura
 */

export interface DatabaseEnvConfig {
  isConfigured: boolean;
  databaseUrl?: string;
  directUrl?: string;
  host?: string;
  port?: string;
  error?: string;
}

/**
 * Analisa as variáveis de ambiente do banco de dados e retorna o status detalhado.
 */
export function getDatabaseEnvConfig(): DatabaseEnvConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();

  if (!databaseUrl) {
    return {
      isConfigured: false,
      error: "DATABASE_URL não configurada no ambiente.",
    };
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.protocol.startsWith("postgres")) {
      return {
        isConfigured: false,
        error: "DATABASE_URL inválida. O protocolo deve ser postgresql:// ou postgres://",
      };
    }

    return {
      isConfigured: true,
      databaseUrl,
      directUrl,
      host: url.hostname,
      port: url.port || "5432",
    };
  } catch {
    return {
      isConfigured: false,
      error: "DATABASE_URL possui uma estrutura de URL malformada.",
    };
  }
}

let hasWarned = false;

/**
 * Emite aviso no console do servidor Next.js caso as variáveis de banco estejam ausentes.
 * Não quebra o build estático, garantindo a resiliência das calculadoras públicas.
 */
export function logDatabaseEnvStatus(): void {
  if (hasWarned) return;
  const config = getDatabaseEnvConfig();

  if (!config.isConfigured) {
    hasWarned = true;
    console.warn(
      `\n\x1b[33m[PaceLab]\x1b[0m ⚠️  Aviso de Conexão: ${config.error}\n` +
      `[PaceLab] ℹ️  As calculadoras e histórico operam via localStorage, enquanto o módulo Meu TAF requer o Supabase.\n`
    );
  }
}

// ─── Google Sheets API (Vercel / Serverless Base64) ───────────────────────────

export interface GoogleServiceAccountCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  [key: string]: unknown;
}

export interface GoogleSheetsEnvConfig {
  isConfigured: boolean;
  spreadsheetId?: string;
  credentials?: GoogleServiceAccountCredentials;
  error?: string;
}

/**
 * Decodifica e valida `GOOGLE_SHEETS_SPREADSHEET_ID` e `GOOGLE_CREDENTIALS_BASE64`
 * sem lançar exceções durante o carregamento de módulos/páginas.
 */
export function getGoogleSheetsEnvConfig(): GoogleSheetsEnvConfig {
  const rawSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64?.trim();

  if (!rawSpreadsheetId && !credentialsBase64) {
    return {
      isConfigured: false,
      error:
        "GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_CREDENTIALS_BASE64 não configuradas no ambiente.",
    };
  }

  if (!rawSpreadsheetId) {
    return {
      isConfigured: false,
      error: "GOOGLE_SHEETS_SPREADSHEET_ID não configurada no ambiente.",
    };
  }

  let spreadsheetId = rawSpreadsheetId;
  if (/^https?:\/\//i.test(rawSpreadsheetId)) {
    const match = rawSpreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match?.[1]) {
      return {
        isConfigured: false,
        error:
          "GOOGLE_SHEETS_SPREADSHEET_ID inválido: informe apenas o ID da planilha (ou URL completa /spreadsheets/d/<ID>/).",
      };
    }
    spreadsheetId = match[1];
  }

  if (!credentialsBase64) {
    return {
      isConfigured: false,
      error: "GOOGLE_CREDENTIALS_BASE64 não configurada no ambiente.",
    };
  }

  const normalizedBase64 = credentialsBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    return {
      isConfigured: false,
      error:
        "GOOGLE_CREDENTIALS_BASE64 possui caracteres inválidos para Base64.",
    };
  }

  try {
    const decodedText = Buffer.from(normalizedBase64, "base64").toString("utf-8");
    const parsed = JSON.parse(decodedText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        isConfigured: false,
        error:
          "GOOGLE_CREDENTIALS_BASE64 não decodifica para um objeto JSON de Conta de Serviço.",
      };
    }

    const record = parsed as Record<string, unknown>;
    const clientEmail =
      typeof record.client_email === "string" ? record.client_email.trim() : "";
    const privateKeyRaw =
      typeof record.private_key === "string" ? record.private_key.trim() : "";

    if (!clientEmail || !privateKeyRaw) {
      return {
        isConfigured: false,
        error:
          "Credenciais Google em Base64 devem conter os campos obrigatórios client_email e private_key.",
      };
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    return {
      isConfigured: true,
      spreadsheetId,
      credentials: {
        ...(record as GoogleServiceAccountCredentials),
        client_email: clientEmail,
        private_key: privateKey,
      },
    };
  } catch {
    return {
      isConfigured: false,
      error:
        "GOOGLE_CREDENTIALS_BASE64 não contém um JSON de Conta de Serviço válido.",
    };
  }
}

/**
 * Indica de forma rápida e segura se a integração Google Sheets está configurada.
 */
export function isGoogleSheetsConfigured(): boolean {
  return getGoogleSheetsEnvConfig().isConfigured;
}
