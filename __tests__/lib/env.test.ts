import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDatabaseEnvConfig,
  logDatabaseEnvStatus,
  getGoogleSheetsEnvConfig,
  isGoogleSheetsConfigured,
} from "@/lib/env";

describe("lib/env — Configuração de Banco e Google Sheets", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_CREDENTIALS_BASE64;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDatabaseEnvConfig & logDatabaseEnvStatus", () => {
    it("retorna não configurado quando DATABASE_URL está ausente", () => {
      delete process.env.DATABASE_URL;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const res = getDatabaseEnvConfig();
      expect(res.isConfigured).toBe(false);
      expect(res.error).toContain("DATABASE_URL");

      logDatabaseEnvStatus();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("valida protocolo postgres:// ou postgresql://", () => {
      process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";
      const invalidProto = getDatabaseEnvConfig();
      expect(invalidProto.isConfigured).toBe(false);

      process.env.DATABASE_URL = "not-a-valid-url";
      const malformed = getDatabaseEnvConfig();
      expect(malformed.isConfigured).toBe(false);

      process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/pacelab";
      const valid = getDatabaseEnvConfig();
      expect(valid.isConfigured).toBe(true);
      expect(valid.host).toBe("localhost");
      expect(valid.port).toBe("5433");
    });
  });

  describe("getGoogleSheetsEnvConfig & isGoogleSheetsConfigured", () => {
    it("retorna não configurado sem lançar exceção quando ambas as variáveis faltam", () => {
      const cfg = getGoogleSheetsEnvConfig();
      expect(cfg.isConfigured).toBe(false);
      expect(cfg.error).toContain("GOOGLE_SHEETS_SPREADSHEET_ID");
      expect(cfg.error).toContain("GOOGLE_CREDENTIALS_BASE64");
      expect(isGoogleSheetsConfigured()).toBe(false);
    });

    it("detecta ausência individual de spreadsheetId ou credentialsBase64", () => {
      process.env.GOOGLE_CREDENTIALS_BASE64 = "e30=";
      let cfg = getGoogleSheetsEnvConfig();
      expect(cfg.isConfigured).toBe(false);
      expect(cfg.error).toContain("GOOGLE_SHEETS_SPREADSHEET_ID");

      delete process.env.GOOGLE_CREDENTIALS_BASE64;
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "abc123spreadsheet";
      cfg = getGoogleSheetsEnvConfig();
      expect(cfg.isConfigured).toBe(false);
      expect(cfg.error).toContain("GOOGLE_CREDENTIALS_BASE64");
    });

    it("rejeita Base64 inválido, JSON não-objeto ou credenciais incompletas", () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-id-1";

      process.env.GOOGLE_CREDENTIALS_BASE64 = "%%%not-base64%%%";
      expect(getGoogleSheetsEnvConfig().isConfigured).toBe(false);

      process.env.GOOGLE_CREDENTIALS_BASE64 = Buffer.from("[]", "utf-8").toString("base64");
      expect(getGoogleSheetsEnvConfig().isConfigured).toBe(false);

      process.env.GOOGLE_CREDENTIALS_BASE64 = Buffer.from("{bad-json", "utf-8").toString("base64");
      expect(getGoogleSheetsEnvConfig().isConfigured).toBe(false);

      process.env.GOOGLE_CREDENTIALS_BASE64 = Buffer.from(
        JSON.stringify({ client_email: "worker@proj.iam.gserviceaccount.com" }),
        "utf-8"
      ).toString("base64");
      const missingKey = getGoogleSheetsEnvConfig();
      expect(missingKey.isConfigured).toBe(false);
      expect(missingKey.error).toContain("private_key");
    });

    it("decodifica credenciais válidas em Base64 e normaliza quebras de linha da private_key", () => {
      const fakeCredentials = {
        type: "service_account",
        project_id: "pacelabd",
        client_email: "  pacelab-worker@pacelabd.iam.gserviceaccount.com ",
        private_key: "-----BEGIN PRIVATE KEY-----\\nABC123\\n-----END PRIVATE KEY-----\\n",
      };
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = " 1AbCdEfGhIjKlMnOpQrStUvWxYz ";
      process.env.GOOGLE_CREDENTIALS_BASE64 = Buffer.from(
        JSON.stringify(fakeCredentials),
        "utf-8"
      ).toString("base64");

      const cfg = getGoogleSheetsEnvConfig();
      expect(cfg.isConfigured).toBe(true);
      expect(cfg.spreadsheetId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz");
      expect(cfg.credentials?.client_email).toBe(
        "pacelab-worker@pacelabd.iam.gserviceaccount.com"
      );
      expect(cfg.credentials?.private_key).toContain("\nABC123\n");
      expect(isGoogleSheetsConfigured()).toBe(true);
    });

    it("extrai o ID automaticamente quando uma URL completa do Google Sheets é informada e rejeita URL inválida", () => {
      process.env.GOOGLE_CREDENTIALS_BASE64 = Buffer.from(
        JSON.stringify({
          client_email: "worker@proj.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nXYZ\n-----END PRIVATE KEY-----\n",
        }),
        "utf-8"
      ).toString("base64");

      process.env.GOOGLE_SHEETS_SPREADSHEET_ID =
        " https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?gid=0#gid=0 ";
      const fromUrl = getGoogleSheetsEnvConfig();
      expect(fromUrl.isConfigured).toBe(true);
      expect(fromUrl.spreadsheetId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz");

      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "https://docs.google.com/document/d/wrong";
      const badUrl = getGoogleSheetsEnvConfig();
      expect(badUrl.isConfigured).toBe(false);
      expect(badUrl.error).toContain("URL");
    });
  });
});
