import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSyncWithGoogleSheets } = vi.hoisted(() => ({
  mockSyncWithGoogleSheets: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainingSession: {
      findMany: vi.fn(),
    },
    tafAttempt: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/googleSheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/googleSheets")>();
  return {
    ...actual,
    syncWithGoogleSheets: mockSyncWithGoogleSheets,
  };
});

import { prisma } from "@/lib/prisma";
import { GoogleSheetsNotConfiguredError, resetGoogleSheetsClientCache } from "@/lib/googleSheets";
import { GET, POST, runtime, dynamic } from "@/app/api/sync/sheets/route";

function createTestCredentialsBase64(): string {
  return Buffer.from(
    JSON.stringify({
      type: "service_account",
      client_email: "pacelab-sync@pacelab-test.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nTESTKEY\\n-----END PRIVATE KEY-----\\n",
    }),
    "utf-8"
  ).toString("base64");
}

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/sync/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("Fase 5 — Endpoint /api/sync/sheets", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetGoogleSheetsClientCache();
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "";
    process.env.GOOGLE_CREDENTIALS_BASE64 = "";

    vi.mocked(prisma.trainingSession.findMany).mockResolvedValue([]);
    vi.mocked(prisma.tafAttempt.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("declara runtime='nodejs' e dynamic='force-dynamic' para compatibilidade serverless", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });

  describe("GET /api/sync/sheets", () => {
    it("retorna configured=false quando env vars estão ausentes e contabiliza pendentes reais no Postgres", async () => {
      const baseTime = new Date("2026-11-14T12:00:00.000Z");
      vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([
        // Pendente: syncedToSheetsAt nulo
        { syncedToSheetsAt: null, updatedAt: baseTime },
        // Pendente: editado 5s após sync (> 2000ms)
        { syncedToSheetsAt: baseTime, updatedAt: new Date(baseTime.getTime() + 5000) },
        // Não pendente: jitter do @updatedAt de 500ms (<= 2000ms)
        { syncedToSheetsAt: baseTime, updatedAt: new Date(baseTime.getTime() + 500) },
      ] as never);

      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([
        // Pendente: nunca sincronizado
        { syncedToSheetsAt: null, updatedAt: baseTime },
        // Já sincronizado
        { syncedToSheetsAt: baseTime, updatedAt: baseTime },
      ] as never);

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.configured).toBe(false);
      expect(json.data.error).toBeTruthy();
      expect(json.data.pendingTrainingsCount).toBe(2);
      expect(json.data.pendingAttemptsCount).toBe(1);
      expect(json.data.totalPendingCount).toBe(3);
      expect(mockSyncWithGoogleSheets).not.toHaveBeenCalled();
    });

    it("retorna configured=true sem erro e contagens zeradas quando tudo está sincronizado", async () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-12345";
      process.env.GOOGLE_CREDENTIALS_BASE64 = createTestCredentialsBase64();

      const synced = new Date("2026-11-14T12:00:00.000Z");
      vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([
        { syncedToSheetsAt: synced, updatedAt: synced },
      ] as never);
      vi.mocked(prisma.tafAttempt.findMany).mockResolvedValueOnce([
        { syncedToSheetsAt: synced, updatedAt: new Date(synced.getTime() + 1000) },
      ] as never);

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      });
    });
  });

  describe("POST /api/sync/sheets", () => {
    const sampleReport = {
      direction: "bidirectional" as const,
      forceFullResync: false,
      pulledUpdated: 1,
      pulledCreated: 2,
      pulledLinked: 1,
      pushedAppended: 3,
      pushedUpdated: 1,
      tafPulledUpdated: 0,
      tafPulledCreated: 1,
      tafPulledLinked: 0,
      tafPushedAppended: 1,
      tafPushedUpdated: 0,
      profileSynced: true,
      weeklyPlan: {
        imported: 4,
        updated: 1,
        removed: 0,
        matched: 2,
        missed: 1,
        pushed: 3,
        sheetMissingOrEmpty: false,
      },
      skipped: 0,
      warnings: [],
      durationMs: 420,
      syncedAt: "2026-11-14T16:00:00.000Z",
    };

    it("retorna 400 para payload Zod inválido e para JSON malformado", async () => {
      const invalidDirectionRes = await POST(createJsonRequest({ direction: "invalid_dir" }));
      const invalidDirectionJson = await invalidDirectionRes.json();
      expect(invalidDirectionRes.status).toBe(400);
      expect(invalidDirectionJson.success).toBe(false);

      const invalidTypeRes = await POST(createJsonRequest({ forceFullResync: "sim" }));
      expect(invalidTypeRes.status).toBe(400);

      const malformedRes = await POST(createJsonRequest("{bad-json"));
      const malformedJson = await malformedRes.json();
      expect(malformedRes.status).toBe(400);
      expect(malformedJson.success).toBe(false);
    });

    it("retorna 503 com code SHEETS_NOT_CONFIGURED quando credenciais estão ausentes", async () => {
      const res = await POST(createJsonRequest({ direction: "bidirectional" }));
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.success).toBe(false);
      expect(json.details?.code).toBe("SHEETS_NOT_CONFIGURED");
      expect(mockSyncWithGoogleSheets).not.toHaveBeenCalled();
    });

    it("executa sincronização bidirecional padrão (inclusive com body vazio) e retorna 200", async () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-12345";
      process.env.GOOGLE_CREDENTIALS_BASE64 = createTestCredentialsBase64();
      mockSyncWithGoogleSheets.mockResolvedValueOnce(sampleReport);

      const res = await POST(
        new Request("http://localhost:3000/api/sync/sheets", {
          method: "POST",
        })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSyncWithGoogleSheets).toHaveBeenCalledWith({
        direction: "bidirectional",
        forceFullResync: false,
      });
      expect(json.data).toEqual(sampleReport);
      expect(json.data.weeklyPlan).toEqual({
        imported: 4,
        updated: 1,
        removed: 0,
        matched: 2,
        missed: 1,
        pushed: 3,
        sheetMissingOrEmpty: false,
      });
    });

    it("repassa direction='push' e forceFullResync=true para backfill completo", async () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-12345";
      process.env.GOOGLE_CREDENTIALS_BASE64 = createTestCredentialsBase64();
      mockSyncWithGoogleSheets.mockResolvedValueOnce({
        ...sampleReport,
        direction: "push",
        forceFullResync: true,
      });

      const res = await POST(
        createJsonRequest({ direction: "push", forceFullResync: true })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(mockSyncWithGoogleSheets).toHaveBeenCalledWith({
        direction: "push",
        forceFullResync: true,
      });
      expect(json.data.forceFullResync).toBe(true);
    });

    it("propaga weeklyPlan.adapted e warnings da aba Plano_Semanal no relatório de sync", async () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-12345";
      process.env.GOOGLE_CREDENTIALS_BASE64 = createTestCredentialsBase64();
      mockSyncWithGoogleSheets.mockResolvedValueOnce({
        ...sampleReport,
        weeklyPlan: {
          ...sampleReport.weeklyPlan,
          adapted: 2,
        },
        warnings: [
          {
            tab: "Plano_Semanal",
            rowNumber: 5,
            message: "Linha 5 (Plano_Semanal): Data inválida",
          },
        ],
      });

      const res = await POST(createJsonRequest({ direction: "bidirectional" }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.weeklyPlan.adapted).toBe(2);
      expect(json.data.warnings).toEqual([
        {
          tab: "Plano_Semanal",
          rowNumber: 5,
          message: "Linha 5 (Plano_Semanal): Data inválida",
        },
      ]);
    });

    it("mapeia erros HTTP da API do Google (429 quota, 403 permissão, 404 not found, 503 indisponível)", async () => {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-12345";
      process.env.GOOGLE_CREDENTIALS_BASE64 = createTestCredentialsBase64();

      mockSyncWithGoogleSheets.mockRejectedValueOnce({ response: { status: 429 } });
      const res429 = await POST(createJsonRequest({}));
      const json429 = await res429.json();
      expect(res429.status).toBe(429);
      expect(json429.details?.code).toBe("SHEETS_QUOTA_EXCEEDED");

      mockSyncWithGoogleSheets.mockRejectedValueOnce({ status: 403 });
      const res403 = await POST(createJsonRequest({}));
      const json403 = await res403.json();
      expect(res403.status).toBe(502);
      expect(json403.details?.code).toBe("SHEETS_PERMISSION_DENIED");

      mockSyncWithGoogleSheets.mockRejectedValueOnce({ code: 404 });
      const res404 = await POST(createJsonRequest({}));
      const json404 = await res404.json();
      expect(res404.status).toBe(502);
      expect(json404.details?.code).toBe("SHEETS_NOT_FOUND");

      mockSyncWithGoogleSheets.mockRejectedValueOnce({ response: { status: 503 } });
      const res503 = await POST(createJsonRequest({}));
      const json503 = await res503.json();
      expect(res503.status).toBe(503);
      expect(json503.details?.code).toBe("SHEETS_UNAVAILABLE");

      mockSyncWithGoogleSheets.mockRejectedValueOnce(new GoogleSheetsNotConfiguredError());
      const resNotCfg = await POST(createJsonRequest({}));
      expect(resNotCfg.status).toBe(503);

      mockSyncWithGoogleSheets.mockRejectedValueOnce(new Error("Falha interna inesperada"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res500 = await POST(createJsonRequest({}));
      expect(res500.status).toBe(500);
      errSpy.mockRestore();
    });
  });
});
