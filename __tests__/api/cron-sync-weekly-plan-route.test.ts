import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockGetGoogleSheetsEnvConfig, mockSyncWithGoogleSheets } = vi.hoisted(() => ({
  mockGetGoogleSheetsEnvConfig: vi.fn(),
  mockSyncWithGoogleSheets: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getGoogleSheetsEnvConfig: mockGetGoogleSheetsEnvConfig,
}));

vi.mock("@/lib/googleSheets", () => ({
  syncWithGoogleSheets: mockSyncWithGoogleSheets,
  extractGoogleApiStatus: (err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      return Number((err as { status: unknown }).status);
    }
    return undefined;
  },
  GoogleSheetsNotConfiguredError: class GoogleSheetsNotConfiguredError extends Error {},
}));

import { GET, maxDuration } from "@/app/api/cron/sync-weekly-plan/route";

describe("API /api/cron/sync-weekly-plan (GET — Vercel Cron Domingo 22h BRT)", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret-cron-token-123";
    mockGetGoogleSheetsEnvConfig.mockReturnValue({
      isConfigured: true,
      spreadsheetId: "sheet-123",
    });
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("retorna 503 quando CRON_SECRET não está configurada no ambiente", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer qualquer" },
      })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("CRON_SECRET_NOT_CONFIGURED");
    expect(mockSyncWithGoogleSheets).not.toHaveBeenCalled();
  });

  it("retorna 401 quando Authorization está ausente, sem Bearer ou com token divergente", async () => {
    expect(maxDuration).toBe(60);

    const resMissing = await GET(new Request("http://localhost/api/cron/sync-weekly-plan"));
    expect(resMissing.status).toBe(401);
    expect(resMissing.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect((await resMissing.json()).code).toBe("UNAUTHORIZED");

    const resWrongScheme = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Basic super-secret-cron-token-123" },
      })
    );
    expect(resWrongScheme.status).toBe(401);

    const resWrongToken = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer token-errado" },
      })
    );
    expect(resWrongToken.status).toBe(401);

    const resSameLenWrong = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer super-secret-cron-token-999" },
      })
    );
    expect(resSameLenWrong.status).toBe(401);
    expect(mockSyncWithGoogleSheets).not.toHaveBeenCalled();
  });

  it("retorna 503 quando integração Google Sheets não está configurada", async () => {
    mockGetGoogleSheetsEnvConfig.mockReturnValue({
      isConfigured: false,
      error: "GOOGLE_SHEETS_SPREADSHEET_ID não configurada.",
    });

    const res = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer super-secret-cron-token-123" },
      })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("SHEETS_NOT_CONFIGURED");
    expect(mockSyncWithGoogleSheets).not.toHaveBeenCalled();
  });

  it("retorna 200 e executa sync bidirecional completo quando autorizado com CRON_SECRET", async () => {
    const mockReport = {
      direction: "bidirectional",
      forceFullResync: false,
      pulledUpdated: 0,
      pulledCreated: 0,
      pulledLinked: 0,
      pushedAppended: 0,
      pushedUpdated: 0,
      tafPulledUpdated: 0,
      tafPulledCreated: 0,
      tafPulledLinked: 0,
      tafPushedAppended: 0,
      tafPushedUpdated: 0,
      profileSynced: true,
      weeklyPlan: {
        imported: 5,
        updated: 0,
        removed: 0,
        matched: 1,
        adapted: 1,
        missed: 1,
        pushed: 2,
        sheetMissingOrEmpty: false,
      },
      skipped: 0,
      warnings: [],
      durationMs: 320,
      syncedAt: "2026-11-23T01:00:05.000Z",
    };
    mockSyncWithGoogleSheets.mockResolvedValueOnce(mockReport);

    const res = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer super-secret-cron-token-123" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(mockReport);
    expect(mockSyncWithGoogleSheets).toHaveBeenCalledWith({
      direction: "bidirectional",
      forceFullResync: false,
    });
  });

  it("mapeia erro upstream 429 da Google API para HTTP 429 padronizado e propaga erro inesperado como 500", async () => {
    mockSyncWithGoogleSheets.mockRejectedValueOnce({ status: 429, message: "Rate limit" });

    const res = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer super-secret-cron-token-123" },
      })
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("SHEETS_QUOTA_EXCEEDED");

    mockSyncWithGoogleSheets.mockRejectedValueOnce(new Error("Falha inesperada no sync"));
    const res500 = await GET(
      new Request("http://localhost/api/cron/sync-weekly-plan", {
        headers: { authorization: "Bearer super-secret-cron-token-123" },
      })
    );
    expect(res500.status).toBe(500);
    const json500 = await res500.json();
    expect(json500.code).toBe("INTERNAL_ERROR");
  });
});
