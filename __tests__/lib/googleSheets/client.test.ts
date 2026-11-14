import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSheetsFactory, mockGoogleAuthConstructor } = vi.hoisted(() => ({
  mockSheetsFactory: vi.fn(),
  mockGoogleAuthConstructor: vi.fn(),
}));

vi.mock("@googleapis/sheets", () => ({
  sheets: mockSheetsFactory,
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: mockGoogleAuthConstructor,
}));

import {
  GoogleSheetsNotConfiguredError,
  extractGoogleApiStatus,
  isRetryableGoogleError,
  getGoogleSheetsClient,
  resetGoogleSheetsClientCache,
  withSheetsRetry,
  getSheetIdsMap,
  getSheetIdByTitle,
} from "@/lib/googleSheets/client";

function createValidCredentialsBase64(overrides?: Record<string, unknown>): string {
  const payload = {
    type: "service_account",
    project_id: "pacelab-test",
    private_key_id: "key-1",
    private_key: "-----BEGIN PRIVATE KEY-----\\nABC123\\n-----END PRIVATE KEY-----\\n",
    client_email: "pacelab@pacelab-test.iam.gserviceaccount.com",
    ...overrides,
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

describe("Google Sheets Client Serverless (lib/googleSheets/client.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetGoogleSheetsClientCache();
    delete process.env.GOOGLE_CREDENTIALS_BASE64;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    mockGoogleAuthConstructor.mockImplementation(function (this: Record<string, unknown>, opts: unknown) {
      this.options = opts;
    });
    mockSheetsFactory.mockImplementation((opts: unknown) => ({
      __mockOpts: opts,
      spreadsheets: {
        get: vi.fn(),
        batchUpdate: vi.fn(),
        values: {
          get: vi.fn(),
          batchGet: vi.fn(),
          update: vi.fn(),
          batchUpdate: vi.fn(),
          append: vi.fn(),
        },
      },
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetGoogleSheetsClientCache();
  });

  it("lança GoogleSheetsNotConfiguredError quando variáveis de ambiente estão ausentes", () => {
    const defaultErr = new GoogleSheetsNotConfiguredError();
    expect(defaultErr.name).toBe("GoogleSheetsNotConfiguredError");
    expect(defaultErr.message).toMatch(/GOOGLE_SHEETS_SPREADSHEET_ID/);

    expect(() => getGoogleSheetsClient()).toThrowError(GoogleSheetsNotConfiguredError);
    expect(() => getGoogleSheetsClient()).toThrow(/GOOGLE_SHEETS_SPREADSHEET_ID/i);
  });

  it("lança GoogleSheetsNotConfiguredError quando Base64 é inválido", () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-123";
    process.env.GOOGLE_CREDENTIALS_BASE64 = "!!!not-base64!!!";

    expect(() => getGoogleSheetsClient()).toThrowError(GoogleSheetsNotConfiguredError);
    expect(() => getGoogleSheetsClient()).toThrow(/Base64/i);
  });

  it("decodifica Base64, inicializa GoogleAuth com scope spreadsheets e cria cliente enxuto v4", () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-abc";
    process.env.GOOGLE_CREDENTIALS_BASE64 = createValidCredentialsBase64();

    const bundle = getGoogleSheetsClient();

    expect(bundle.spreadsheetId).toBe("sheet-abc");
    expect(bundle.clientEmail).toBe("pacelab@pacelab-test.iam.gserviceaccount.com");
    expect(mockGoogleAuthConstructor).toHaveBeenCalledTimes(1);
    expect(mockGoogleAuthConstructor).toHaveBeenCalledWith({
      credentials: expect.objectContaining({
        client_email: "pacelab@pacelab-test.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nABC123\n-----END PRIVATE KEY-----\n",
      }),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    expect(mockSheetsFactory).toHaveBeenCalledTimes(1);
    expect(mockSheetsFactory).toHaveBeenCalledWith({
      version: "v4",
      auth: expect.any(Object),
    });
  });

  it("reutiliza cliente em cache enquanto credenciais permanecem idênticas e renova ao rotacionar env", () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-1";
    process.env.GOOGLE_CREDENTIALS_BASE64 = createValidCredentialsBase64();

    const first = getGoogleSheetsClient();
    const second = getGoogleSheetsClient();
    expect(first).toBe(second);
    expect(mockSheetsFactory).toHaveBeenCalledTimes(1);

    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-2";
    const rotated = getGoogleSheetsClient();
    expect(rotated).not.toBe(first);
    expect(rotated.spreadsheetId).toBe("sheet-2");
    expect(mockSheetsFactory).toHaveBeenCalledTimes(2);

    const uncached = getGoogleSheetsClient({ bypassCache: true });
    expect(uncached).not.toBe(rotated);
    expect(mockSheetsFactory).toHaveBeenCalledTimes(3);
  });

  it("aceita injeção de factory customizada para testes offline", () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-custom";
    process.env.GOOGLE_CREDENTIALS_BASE64 = createValidCredentialsBase64();

    const customBundle = {
      sheets: {} as ReturnType<typeof mockSheetsFactory>,
      spreadsheetId: "sheet-custom",
      clientEmail: "custom@test.iam.gserviceaccount.com",
    };

    const result = getGoogleSheetsClient({
      factory: () => customBundle,
    });

    expect(result).toBe(customBundle);
    expect(mockSheetsFactory).not.toHaveBeenCalled();
  });

  it("extrai status HTTP de diferentes formatos de erro da API do Google", () => {
    expect(extractGoogleApiStatus({ status: 429 })).toBe(429);
    expect(extractGoogleApiStatus({ code: 503 })).toBe(503);
    expect(extractGoogleApiStatus({ response: { status: 403 } })).toBe(403);
    expect(extractGoogleApiStatus(new Error("boom"))).toBeUndefined();
    expect(extractGoogleApiStatus(null)).toBeUndefined();

    expect(isRetryableGoogleError({ status: 429 })).toBe(true);
    expect(isRetryableGoogleError({ response: { status: 503 } })).toBe(true);
    expect(isRetryableGoogleError({ status: 403 })).toBe(false);
    expect(isRetryableGoogleError({ status: 400 })).toBe(false);
  });

  it("aplica retry exponencial controlado para erros 429 e 503", async () => {
    const sleepCalls: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const operation = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce({ status: 429, message: "Rate Limit Exceeded" })
      .mockRejectedValueOnce({ response: { status: 503 }, message: "Backend Unavailable" })
      .mockResolvedValueOnce("ok");

    const result = await withSheetsRetry(operation, {
      maxRetries: 2,
      baseDelayMs: 50,
      sleep,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([50, 100]);

    const realSleepOp = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce("recovered");
    expect(await withSheetsRetry(realSleepOp, { maxRetries: 1, baseDelayMs: 1 })).toBe("recovered");
  });

  it("não repete erro permanente (403/400) e respeita limite de tentativas em 429 contínuo", async () => {
    const sleep = vi.fn(async () => undefined);

    const permOp = vi
      .fn<[], Promise<string>>()
      .mockRejectedValue({ status: 403, message: "Permission denied" });

    await expect(
      withSheetsRetry(permOp, { maxRetries: 2, baseDelayMs: 10, sleep })
    ).rejects.toMatchObject({ status: 403 });
    expect(permOp).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();

    const alwaysRateLimited = vi
      .fn<[], Promise<string>>()
      .mockRejectedValue({ status: 429, message: "Quota exceeded" });

    await expect(
      withSheetsRetry(alwaysRateLimited, { maxRetries: 2, baseDelayMs: 10, sleep })
    ).rejects.toMatchObject({ status: 429 });
    expect(alwaysRateLimited).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("resolve mapa de sheetId numéricos e encontra aba por nome exato ou normalizado", async () => {
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: "Log_Treinos", sheetId: 0 } },
          { properties: { title: "Simulados_TAF", sheetId: 123456 } },
          { properties: { title: "Perfil_e_Metas", sheetId: 999 } },
          { properties: { title: "", sheetId: 55 } },
        ],
      },
    });

    const fakeSheets = {
      spreadsheets: {
        get: mockGet,
      },
    } as unknown as Parameters<typeof getSheetIdsMap>[0];

    const map = await getSheetIdsMap(fakeSheets, "sheet-xyz");
    expect(map.get("Log_Treinos")).toBe(0);
    expect(map.get("Simulados_TAF")).toBe(123456);
    expect(map.get("Perfil_e_Metas")).toBe(999);
    expect(map.size).toBe(3);

    expect(await getSheetIdByTitle(fakeSheets, "sheet-xyz", "Log_Treinos")).toBe(0);
    expect(await getSheetIdByTitle(fakeSheets, "sheet-xyz", "simulados_taf")).toBe(123456);

    await expect(
      getSheetIdByTitle(fakeSheets, "sheet-xyz", "Aba_Inexistente")
    ).rejects.toThrow(/Aba_Inexistente/);
  });
});
