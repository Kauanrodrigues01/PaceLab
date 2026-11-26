import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIsGoogleSheetsConfigured,
  mockGetGoogleSheetsClient,
  mockGetSheetIdByTitle,
  mockPrisma,
} = vi.hoisted(() => {
  const weeklyPlanItem = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };

  const prisma = {
    trainingSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tafAttempt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tafGoal: {
      findFirst: vi.fn(),
    },
    userProfile: {
      findFirst: vi.fn(),
    },
    weightRecord: {
      findFirst: vi.fn(),
    },
    weeklyPlanItem,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: { weeklyPlanItem: typeof weeklyPlanItem }) => Promise<unknown>)({
          weeklyPlanItem,
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return {
    mockIsGoogleSheetsConfigured: vi.fn(),
    mockGetGoogleSheetsClient: vi.fn(),
    mockGetSheetIdByTitle: vi.fn(),
    mockPrisma: prisma,
  };
});

vi.mock("@/lib/env", () => ({
  isGoogleSheetsConfigured: mockIsGoogleSheetsConfigured,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/googleSheets/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/googleSheets/client")>(
    "@/lib/googleSheets/client"
  );
  return {
    ...actual,
    getGoogleSheetsClient: mockGetGoogleSheetsClient,
    getSheetIdByTitle: mockGetSheetIdByTitle,
  };
});

import { Prisma } from "@prisma/client";
import {
  syncTrainingSessionToSheet,
  syncTafAttemptToSheet,
  syncProfileAndGoalToSheet,
  deleteTrainingSessionFromSheet,
  deleteTafAttemptFromSheet,
  syncHistoricalDataToSheets,
  pullChangesFromSheets,
  pullWeeklyPlanFromSheets,
  reconcileWeeklyPlansWithSessions,
  pushWeeklyPlanStatusToSheets,
  syncWeeklyPlanFromSheets,
  syncWithGoogleSheets,
  safeAutoSync,
} from "@/lib/googleSheets";
import { SHEET_HEADERS } from "@/lib/googleSheets/mapper";

function createFakeSheets() {
  return {
    spreadsheets: {
      get: vi.fn(),
      batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
      values: {
        get: vi.fn().mockResolvedValue({ data: { values: [] } }),
        batchGet: vi.fn().mockResolvedValue({ data: { valueRanges: [] } }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
        append: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

describe("Google Sheets Sync Service (lib/googleSheets/syncService.ts)", () => {
  let fakeSheets: ReturnType<typeof createFakeSheets>;
  const fixedNow = new Date("2026-11-14T15:30:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    fakeSheets = createFakeSheets();
    mockIsGoogleSheetsConfigured.mockReturnValue(true);
    mockGetGoogleSheetsClient.mockReturnValue({
      sheets: fakeSheets,
      spreadsheetId: "spreadsheet-123",
      clientEmail: "bot@pacelab.iam.gserviceaccount.com",
    });
    mockGetSheetIdByTitle.mockImplementation(async (_s, _id, tab: string) =>
      tab === "Log_Treinos" ? 10 : tab === "Simulados_TAF" ? 20 : 30
    );

    mockPrisma.tafGoal.findFirst.mockResolvedValue({
      id: "goal-1",
      institutionName: "PF Agente",
      minDistanceMeters: 2400,
      targetDistanceMeters: 2600,
      targetDurationMinutes: 12,
      targetExamDate: new Date("2027-02-15T00:00:00.000Z"),
    });
    mockPrisma.userProfile.findFirst.mockResolvedValue({
      id: "prof-1",
      name: "Kauan",
      birthDate: new Date("1998-05-10T00:00:00.000Z"),
      heightCm: 178,
      currentWeightKg: 75,
      updatedAt: new Date("2026-11-14T10:00:00.000Z"),
    });
    mockPrisma.weightRecord.findFirst.mockResolvedValue({
      id: "w-1",
      weightKg: 74.2,
      recordedAt: new Date("2026-11-14T12:00:00.000Z"),
    });
    mockPrisma.trainingSession.update.mockResolvedValue({});
    mockPrisma.trainingSession.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.tafAttempt.update.mockResolvedValue({});
    mockPrisma.tafAttempt.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValue([]);
    mockPrisma.weeklyPlanItem.findUnique.mockResolvedValue(null);
    mockPrisma.weeklyPlanItem.create.mockResolvedValue({});
    mockPrisma.weeklyPlanItem.update.mockResolvedValue({});
    mockPrisma.weeklyPlanItem.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.weeklyPlanItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  describe("A. Sync Pontual em Tempo Real & Exclusão", () => {
    it("faz append em Log_Treinos quando ID ainda não existe e atualiza syncedToSheetsAt no Postgres", async () => {
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["outra-sessao"]] },
      });

      const session = {
        id: "trn-uuid-1",
        sessionDate: new Date("2026-11-14T09:00:00.000Z"),
        source: "fit_upload" as const,
        activityType: "tempo_run" as const,
        distanceKm: 8.5,
        durationSeconds: 2400,
        paceFormatted: "4:42",
        avgHeartRate: 165,
        maxHeartRate: 182,
        elevationGainM: 40,
        avgCadence: 176,
        perceivedEffort: 8,
        bodyWeightKg: 74.2,
        shoeName: "Corre 3",
        notes: "[Ritmo Forte] Ótimo controle",
      };

      const res = await syncTrainingSessionToSheet(session, { now: () => fixedNow });

      expect(res.action).toBe("appended");
      expect(res.syncedAt).toEqual(fixedNow);
      expect(fakeSheets.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        range: "Log_Treinos!A:O",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            expect.arrayContaining(["trn-uuid-1", "2026-11-14", "fit_upload", "tempo_run"]),
          ],
        },
      });
      expect(fakeSheets.spreadsheets.values.update).not.toHaveBeenCalled();
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-uuid-1" },
        data: { syncedToSheetsAt: fixedNow },
      });
    });

    it("faz update na mesma linha em re-upload/edição sem duplicar e suporta busca por ID string", async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValueOnce({
        id: "trn-existing",
        sessionDate: new Date("2026-11-14T10:00:00.000Z"),
        source: "gpx_upload",
        activityType: "rodagem_leve",
        distanceKm: 5.2,
        durationSeconds: 1700,
        paceFormatted: "5:27",
        notes: "Atualizado",
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["trn-0"], ["trn-existing"], ["trn-2"]] },
      });

      const res = await syncTrainingSessionToSheet("trn-existing", { now: () => fixedNow });

      expect(res.action).toBe("updated");
      expect(fakeSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        range: "Log_Treinos!A3:O3",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [expect.arrayContaining(["trn-existing", "gpx_upload", "rodagem_leve"])],
        },
      });
      expect(fakeSheets.spreadsheets.values.append).not.toHaveBeenCalled();
    });

    it("sincroniza Simulado TAF calculando Status Meta contra TafGoal e atualiza Perfil_e_Metas!A2:I2", async () => {
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [] },
      });

      const attempt = {
        id: "att-1",
        testDate: new Date("2026-11-14T09:00:00.000Z"),
        locationType: "pista_400m" as const,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2620,
        paceFormatted: "4:35",
        speedKmh: 13.1,
        notes: "TAF oficial",
      };

      const tafRes = await syncTafAttemptToSheet(attempt, { now: () => fixedNow });
      expect(tafRes.action).toBe("appended");
      expect(fakeSheets.spreadsheets.values.append).toHaveBeenCalledWith(
        expect.objectContaining({
          range: "Simulados_TAF!A:J",
          requestBody: {
            values: [expect.arrayContaining(["att-1", "pista_400m", 2620, "Meta Segurança Atingida"])],
          },
        })
      );
      expect(mockPrisma.tafAttempt.update).toHaveBeenCalledWith({
        where: { id: "att-1" },
        data: { syncedToSheetsAt: fixedNow },
      });

      const profRes = await syncProfileAndGoalToSheet({ now: () => fixedNow });
      expect(profRes.syncedAt).toEqual(fixedNow);
      expect(fakeSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        range: "Perfil_e_Metas!A2:I2",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["Kauan", 28, 178, 74.2, "PF Agente", 2400, 2600, 12, "2027-02-15"]],
        },
      });
    });

    it("exclui linhas por deleteDimension em ordem decrescente de índice e trata ID ausente graciosamente", async () => {
      // Linha 2 (índice 1) e Linha 4 (índice 3) têm o mesmo ID acidentalmente duplicado
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["trn-del"], ["outro"], ["trn-del"]] },
      });

      const delRes = await deleteTrainingSessionFromSheet("trn-del");
      expect(delRes).toEqual({ deleted: true, deletedCount: 2 });
      expect(mockGetSheetIdByTitle).toHaveBeenCalledWith(
        fakeSheets,
        "spreadsheet-123",
        "Log_Treinos"
      );
      expect(fakeSheets.spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId: 10, dimension: "ROWS", startIndex: 3, endIndex: 4 },
              },
            },
            {
              deleteDimension: {
                range: { sheetId: 10, dimension: "ROWS", startIndex: 1, endIndex: 2 },
              },
            },
          ],
        },
      });

      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["att-other"]] },
      });
      const notFoundDel = await deleteTafAttemptFromSheet("att-missing");
      expect(notFoundDel).toEqual({ deleted: false, deletedCount: 0 });
      expect(fakeSheets.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("B. Backfill em Lote (Incremental vs Full)", () => {
    it("envia apenas pendentes/sujos (>2000ms), ignora falso-dirty (<=2000ms) e respeita ordem cronológica", async () => {
      const syncedAtBase = new Date("2026-11-10T10:00:00.000Z");

      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-never-synced",
          sessionDate: new Date("2026-10-01T09:00:00.000Z"),
          source: "manual",
          activityType: "rodagem_leve",
          distanceKm: 4,
          durationSeconds: 1400,
          paceFormatted: "5:50",
          syncedToSheetsAt: null,
          updatedAt: new Date("2026-10-01T09:30:00.000Z"),
        },
        {
          // @updatedAt jitter < 2000ms -> NÃO deve ser reenviado
          id: "trn-false-dirty",
          sessionDate: new Date("2026-10-15T09:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 6,
          durationSeconds: 1800,
          paceFormatted: "5:00",
          syncedToSheetsAt: syncedAtBase,
          updatedAt: new Date(syncedAtBase.getTime() + 1200),
        },
        {
          // Edição real (> 2000ms depois de syncedToSheetsAt) e já existe na linha 3 -> update em lote
          id: "trn-real-dirty",
          sessionDate: new Date("2026-11-01T09:00:00.000Z"),
          source: "fit_upload",
          activityType: "longao",
          distanceKm: 12,
          durationSeconds: 3900,
          paceFormatted: "5:25",
          syncedToSheetsAt: syncedAtBase,
          updatedAt: new Date(syncedAtBase.getTime() + 60000),
        },
      ]);

      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([
        {
          id: "att-pending",
          testDate: new Date("2026-10-20T09:00:00.000Z"),
          locationType: "rua_plana",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2450,
          paceFormatted: "4:54",
          speedKmh: 12.25,
          syncedToSheetsAt: null,
          updatedAt: new Date("2026-10-20T09:30:00.000Z"),
        },
      ]);

      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            { values: [["trn-false-dirty"], ["trn-real-dirty"]] },
            { values: [] },
          ],
        },
      });

      const res = await syncHistoricalDataToSheets(
        { forceFullResync: false },
        { now: () => fixedNow }
      );

      expect(mockPrisma.trainingSession.findMany).toHaveBeenCalledWith({
        orderBy: { sessionDate: "asc" },
      });
      expect(mockPrisma.tafAttempt.findMany).toHaveBeenCalledWith({
        orderBy: { testDate: "asc" },
      });
      expect(res.pushedUpdated).toBe(1);
      expect(res.pushedAppended).toBe(1);
      expect(res.tafPushedAppended).toBe(1);
      expect(res.tafPushedUpdated).toBe(0);
      expect(res.profileSynced).toBe(true);

      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [
            {
              range: "Log_Treinos!A3:O3",
              values: [expect.arrayContaining(["trn-real-dirty"])],
            },
          ],
        },
      });
      expect(fakeSheets.spreadsheets.values.append).toHaveBeenCalledTimes(2);
      expect(mockPrisma.trainingSession.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["trn-real-dirty", "trn-never-synced"] } },
        data: { syncedToSheetsAt: fixedNow },
      });
      expect(mockPrisma.tafAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["att-pending"] } },
        data: { syncedToSheetsAt: fixedNow },
      });
    });

    it("reenvia todo o histórico em chunks de 200 quando forceFullResync=true", async () => {
      const manySessions = Array.from({ length: 205 }, (_, i) => ({
        id: `trn-${i}`,
        sessionDate: new Date(`2026-01-01T09:00:00.000Z`),
        source: "manual",
        activityType: "corrida_continua",
        distanceKm: 5,
        durationSeconds: 1500,
        paceFormatted: "5:00",
        syncedToSheetsAt: fixedNow,
        updatedAt: fixedNow,
      }));
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce(manySessions);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });

      const res = await syncHistoricalDataToSheets(
        { forceFullResync: true },
        { now: () => fixedNow }
      );

      expect(res.pushedAppended).toBe(205);
      // 205 registros -> 2 chunks (200 + 5)
      expect(fakeSheets.spreadsheets.values.append).toHaveBeenCalledTimes(2);
      expect(mockPrisma.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("C. Sincronização Reversa (Sheets -> Postgres)", () => {
    it("absorve edições existentes (UUID e ID legado trn_*), protege .FIT, ignora no-op e alerta ID órfão", async () => {
      const dbFit = {
        id: "trn_legacy_fit",
        sessionDate: new Date("2026-11-10T10:00:00.000Z"),
        source: "fit_upload",
        externalId: "fit_hash_1",
        activityType: "corrida_continua",
        distanceKm: 10.12,
        durationSeconds: 3000,
        speedKmh: 12.14,
        paceSeconds: 296,
        paceFormatted: "4:56",
        avgHeartRate: 164,
        maxHeartRate: 180,
        elevationGainM: 45,
        avgCadence: 176,
        perceivedEffort: 7,
        bodyWeightKg: 74,
        shoeName: "Corre 3",
        notes: "Original",
        splits: [{ kilometer: 1, durationSeconds: 295, paceFormatted: "4:55" }],
      };

      const dbIdempotent = {
        id: "uuid-same",
        sessionDate: new Date("2026-11-11T12:00:00.000Z"),
        source: "manual",
        activityType: "rodagem_leve",
        distanceKm: 5,
        durationSeconds: 1800,
        speedKmh: 10,
        paceSeconds: 360,
        paceFormatted: "6:00",
        avgHeartRate: null,
        maxHeartRate: null,
        elevationGainM: null,
        avgCadence: null,
        perceivedEffort: null,
        bodyWeightKg: null,
        shoeName: null,
        notes: null,
      };

      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([dbFit, dbIdempotent]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);

      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data", "Origem", "Tipo", "Distância (km)", "Tempo Mov."],
                // Linha 2: FIT editado apenas em notes e RPE (planilha apagou FC/mudou distância, mas deve ser protegido!)
                [
                  "trn_legacy_fit",
                  "2026-11-10",
                  "sheets",
                  "corrida_continua",
                  "99,00",
                  "00:50:00",
                  "4:56",
                  "",
                  "",
                  "",
                  "",
                  "9",
                  "74",
                  "Corre 3",
                  "Editado no Sheets",
                ],
                // Linha 3: Idêntica ao banco -> idempotente (zero update)
                ["uuid-same", "2026-11-11", "manual", "rodagem_leve", "5,00", "00:30:00", "6:00"],
                // Linha 4: ID órfão excluído anteriormente -> warning, sem create
                ["uuid-deleted-before", "2026-11-12", "manual", "longao", "15", "01:15:00"],
              ],
            },
            { values: [] },
          ],
        },
      });

      const res = await pullChangesFromSheets({ now: () => fixedNow });

      expect(res.pulledUpdated).toBe(1);
      expect(res.skipped).toBe(2); // 1 idempotente + 1 órfão
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toMatchObject({ tab: "Log_Treinos", rowNumber: 4 });

      // Atualiza apenas campos contextuais do treino FIT e preserva telemetria rica
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn_legacy_fit" },
        data: {
          activityType: "corrida_continua",
          perceivedEffort: 9,
          bodyWeightKg: 74,
          shoeName: "Corre 3",
          notes: "Editado no Sheets",
          syncedToSheetsAt: fixedNow,
        },
      });
      expect(mockPrisma.trainingSession.create).not.toHaveBeenCalled();
    });

    it("cria registro novo com source='sheets', calcula calorias e grava UUID na Coluna A; deduplica linhas sem ID", async () => {
      const existingSameDay = {
        id: "trn-existing-day",
        sessionDate: new Date("2026-11-13T10:00:00.000Z"),
        source: "gpx_upload",
        activityType: "corrida_continua",
        distanceKm: 5.02, // ±0.05km da linha sem ID
        durationSeconds: 1504, // ±10s da linha sem ID
        speedKmh: 12.02,
        paceSeconds: 300,
        paceFormatted: "5:00",
        shoeName: null,
        notes: null,
        perceivedEffort: null,
        bodyWeightKg: null,
      };

      const existingAttempt = {
        id: "taf_legacy_1",
        source: "manual",
        testDate: new Date("2026-11-12T10:00:00.000Z"),
        locationType: null,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2510,
        paceFormatted: "4:47",
        speedKmh: 12.55,
        notes: null,
      };

      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([existingSameDay]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([existingAttempt]);

      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data"],
                // Linha 2: match deduplicado com existingSameDay (preenche notes e grava ID na Col A)
                ["", "2026-11-13", "", "corrida_continua", "5,00", "00:25:00", "", "", "", "", "", "7", "", "Pegasus", "Match GPX"],
                // Linha 3: treino totalmente novo lançado na planilha (gera UUID + calorias Compêndio 2024)
                ["", "2026-11-14", "", "tempo_run", "6,00", "00:30:00", "", "160", "178", "25", "174", "8", "75", "Corre 3", "Criado no Sheets"],
                // Linha 4: em branco -> ignorada
                ["", "", ""],
              ],
            },
            {
              values: [
                ["ID", "Data"],
                // Linha 2: simulado TAF deduplicado (±25m / ±10s)
                ["", "2026-11-12", "Pista de Atletismo (400m)", "720", "720", "2500", "", "", "", "Merge pista"],
                // Linha 3: simulado TAF novo sem ID
                ["", "2026-11-14", "rua_plana", "720", "720", "2600", "", "", "", "Novo TAF Sheets"],
              ],
            },
          ],
        },
      });

      let seq = 0;
      const generatedIds = ["uuid-gen-trn-1", "uuid-gen-taf-1"];
      const res = await pullChangesFromSheets({
        now: () => fixedNow,
        generateId: () => generatedIds[seq++],
      });

      expect(res.pulledLinked).toBe(1);
      expect(res.pulledCreated).toBe(1);
      expect(res.tafPulledLinked).toBe(1);
      expect(res.tafPulledCreated).toBe(1);

      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-existing-day" },
        data: expect.objectContaining({
          shoeName: "Pegasus",
          notes: "Match GPX",
          perceivedEffort: 7,
          syncedToSheetsAt: fixedNow,
        }),
      });

      expect(mockPrisma.trainingSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "uuid-gen-trn-1",
          source: "sheets",
          activityType: "tempo_run",
          distanceKm: 6,
          durationSeconds: 1800,
          speedKmh: 12,
          paceSeconds: 300,
          paceFormatted: "5:00",
          calorieMethod: "compendium_2024_met",
          calorieSource: "auto_calculated",
          activeCalories: expect.any(Number),
          totalCalories: expect.any(Number),
          metValue: expect.any(Number),
          syncedToSheetsAt: fixedNow,
        }),
      });

      expect(mockPrisma.tafAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "uuid-gen-taf-1",
          source: "sheets",
          distanceMeters: 2600,
          locationType: "rua_plana",
          syncedToSheetsAt: fixedNow,
        }),
      });

      // Escreve os IDs vinculados e recém-criados de volta na Coluna A das duas abas
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [
            { range: "Log_Treinos!A2", values: [["trn-existing-day"]] },
            { range: "Log_Treinos!A3", values: [["uuid-gen-trn-1"]] },
            { range: "Simulados_TAF!A2", values: [["taf_legacy_1"]] },
            { range: "Simulados_TAF!A3", values: [["uuid-gen-taf-1"]] },
          ],
        },
      });
    });
  });

  describe("D. Orquestrador Unificado & safeAutoSync", () => {
    it("executa pull -> push em bidirectional padrão e captura órfãos antes do backfill em forceFullResync=true", async () => {
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValue({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });

      const biReport = await syncWithGoogleSheets(
        { direction: "bidirectional", forceFullResync: false },
        { now: () => fixedNow }
      );
      expect(biReport.direction).toBe("bidirectional");
      expect(biReport.forceFullResync).toBe(false);
      expect(biReport.profileSynced).toBe(true);
      expect(fakeSheets.spreadsheets.values.batchGet).toHaveBeenCalledTimes(2); // 1 pull + 1 push

      vi.clearAllMocks();
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      mockPrisma.tafGoal.findFirst.mockResolvedValue(null);
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValue({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });

      const forceReport = await syncWithGoogleSheets(
        { forceFullResync: true },
        { now: () => fixedNow }
      );
      expect(forceReport.forceFullResync).toBe(true);
      expect(forceReport.profileSynced).toBe(true);

      const pullOnly = await syncWithGoogleSheets({ direction: "pull" }, { now: () => fixedNow });
      expect(pullOnly.direction).toBe("pull");
      expect(pullOnly.profileSynced).toBe(false);

      const pushOnly = await syncWithGoogleSheets({ direction: "push" }, { now: () => fixedNow });
      expect(pushOnly.direction).toBe("push");
      expect(pushOnly.profileSynced).toBe(true);
    });

    it("safeAutoSync pula em 0ms sem env configurada e captura HTTP 429/500 sem quebrar requisição", async () => {
      mockIsGoogleSheetsConfigured.mockReturnValueOnce(false);
      const skippedFn = vi.fn();

      const skipped = await safeAutoSync(skippedFn);
      expect(skipped).toEqual({ skipped: true, ok: true });
      expect(skippedFn).not.toHaveBeenCalled();

      const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const failingFn = vi.fn().mockRejectedValueOnce(new Error("HTTP 429 Quota Exceeded"));

      const failed = await safeAutoSync(failingFn);
      expect(failed).toEqual({
        skipped: false,
        ok: false,
        syncedAt: null,
        error: "HTTP 429 Quota Exceeded",
      });
      expect(consoleErrSpy).toHaveBeenCalledWith("[SheetsSync]", expect.any(Error));
      consoleErrSpy.mockRestore();

      const okRes = await safeAutoSync(async () => ({ syncedAt: fixedNow, action: "updated" }));
      expect(okRes).toEqual({
        skipped: false,
        ok: true,
        syncedAt: fixedNow.toISOString(),
        data: { syncedAt: fixedNow, action: "updated" },
      });

      const okWithoutTimestamp = await safeAutoSync(async () => ({ deleted: true }));
      expect(okWithoutTimestamp.ok).toBe(true);
      expect(okWithoutTimestamp.skipped).toBe(false);
      expect(typeof okWithoutTimestamp.syncedAt).toBe("string");

      const consoleErrSpy2 = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const stringFail = await safeAutoSync(async () => {
        throw "falha-string";
      });
      expect(stringFail).toEqual({
        skipped: false,
        ok: false,
        syncedAt: null,
        error: "falha-string",
      });
      consoleErrSpy2.mockRestore();
    });
  });

  describe("E. Cobertura Complementar (Erros Controlados, TAF Pull/Update e Regras de Borda)", () => {
    it("lança erro ao buscar IDs ausentes em sync Pontual, suporta update em syncTafAttemptToSheet(id) e ignora delete com ID vazio", async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValueOnce(null);
      await expect(syncTrainingSessionToSheet("trn-inexistente")).rejects.toThrow(/não encontrada/);

      mockPrisma.tafAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(syncTafAttemptToSheet("att-inexistente")).rejects.toThrow(/não encontrado/);

      mockPrisma.tafAttempt.findUnique.mockResolvedValueOnce({
        id: "att-existing",
        testDate: new Date("2026-11-14T09:00:00.000Z"),
        locationType: "esteira",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2350,
        paceFormatted: "5:06",
        speedKmh: 11.75,
        notes: "Esteira",
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["att-existing"]] },
      });

      const updTaf = await syncTafAttemptToSheet("att-existing", { now: () => fixedNow });
      expect(updTaf.action).toBe("updated");
      expect(fakeSheets.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          range: "Simulados_TAF!A2:J2",
        })
      );

      const emptyDel = await deleteTrainingSessionFromSheet("   ");
      expect(emptyDel).toEqual({ deleted: false, deletedCount: 0 });
    });

    it("atualiza TafAttempt sujo em backfill incremental e ignora TafAttempt limpo", async () => {
      const syncedBase = new Date("2026-11-10T10:00:00.000Z");
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([
        {
          id: "att-clean",
          testDate: new Date("2026-11-01T09:00:00.000Z"),
          locationType: "rua_plana",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2450,
          paceFormatted: "4:54",
          speedKmh: 12.25,
          syncedToSheetsAt: syncedBase,
          updatedAt: new Date(syncedBase.getTime() + 500),
        },
        {
          id: "att-dirty-update",
          testDate: new Date("2026-11-05T09:00:00.000Z"),
          locationType: "pista_400m",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2650,
          paceFormatted: "4:32",
          speedKmh: 13.25,
          syncedToSheetsAt: syncedBase,
          updatedAt: new Date(syncedBase.getTime() + 10000),
        },
      ]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [["att-dirty-update"]] }] },
      });

      const res = await syncHistoricalDataToSheets(
        { forceFullResync: false },
        { now: () => fixedNow }
      );
      expect(res.tafPushedUpdated).toBe(1);
      expect(res.tafPushedAppended).toBe(0);
      expect(mockPrisma.tafAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["att-dirty-update"] } },
        data: { syncedToSheetsAt: fixedNow },
      });
    });

    it("trata linhas inválidas, parser warnings, edição manual de Log_Treinos/Simulados_TAF, proteção .FIT em TAF e deduplicação complementar", async () => {
      const manualSession = {
        id: "trn-manual-edit",
        sessionDate: new Date("2026-11-08T10:00:00.000Z"),
        source: "manual",
        activityType: "rodagem_leve",
        distanceKm: 5,
        durationSeconds: 1800,
        speedKmh: 10,
        paceSeconds: 360,
        paceFormatted: "6:00",
        avgHeartRate: null,
        maxHeartRate: null,
        elevationGainM: null,
        avgCadence: null,
        perceivedEffort: null,
        bodyWeightKg: null,
        shoeName: null,
        notes: null,
      };
      const manualMatchEmpty = {
        id: "trn-manual-merge",
        sessionDate: new Date("2026-11-09T10:00:00.000Z"),
        source: "manual",
        activityType: "corrida_continua",
        distanceKm: 6,
        durationSeconds: 1800,
        speedKmh: 12,
        paceSeconds: 300,
        paceFormatted: "5:00",
        avgHeartRate: null,
        maxHeartRate: null,
        elevationGainM: null,
        avgCadence: null,
        perceivedEffort: null,
        bodyWeightKg: null,
        shoeName: null,
        notes: null,
      };

      const tafManualEdit = {
        id: "att-manual-edit",
        source: "manual",
        testDate: new Date("2026-11-01T12:00:00.000Z"),
        locationType: "rua_plana",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2400,
        speedKmh: 12,
        paceSeconds: 300,
        paceFormatted: "5:00",
        notes: null,
      };
      const tafFitProtected = {
        id: "att-fit-prot",
        source: "fit_upload",
        testDate: new Date("2026-11-02T12:00:00.000Z"),
        locationType: "pista_400m",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2600,
        speedKmh: 13,
        paceSeconds: 277,
        paceFormatted: "4:37",
        notes: "Original FIT",
      };
      const tafIdempotent = {
        id: "att-same",
        source: "manual",
        testDate: new Date("2026-11-03T12:00:00.000Z"),
        locationType: "esteira",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2300,
        speedKmh: 11.5,
        paceSeconds: 313,
        paceFormatted: "5:13",
        notes: null,
      };

      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([manualSession, manualMatchEmpty]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([
        tafManualEdit,
        tafFitProtected,
        tafIdempotent,
      ]);

      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data"],
                // Linha 2: inválida (data inválida)
                ["", "data-ruim", "manual", "corrida_continua", "5", "00:30:00"],
                // Linha 3: edição manual com parser warning (Tipo desconhecido + FC Max < FC Média)
                [
                  "trn-manual-edit",
                  "2026-11-08",
                  "manual",
                  "Treino Ninja",
                  "7,50",
                  "00:35:00",
                  "4:40",
                  "170",
                  "160",
                  "35",
                  "178",
                  "8",
                  "76",
                  "Novablast",
                  "Edit manual",
                ],
                // Linha 4: merge sem ID preenchendo HR/elev/cadence ausentes em manual
                [
                  "",
                  "2026-11-09",
                  "",
                  "corrida_continua",
                  "6,00",
                  "00:30:00",
                  "",
                  "155",
                  "172",
                  "20",
                  "174",
                  "6",
                  "74",
                  "Tenis X",
                  "Merge complete",
                ],
              ],
            },
            {
              values: [
                ["ID", "Data"],
                // Linha 2: inválida (distância inválida)
                ["", "2026-11-01", "rua_plana", "720", "720", "10"],
                // Linha 3: órfão em Simulados_TAF
                ["att-orphan", "2026-11-01", "rua_plana", "720", "720", "2500"],
                // Linha 4: idêntico
                ["att-same", "2026-11-03", "esteira", "720", "720", "2300"],
                // Linha 5: TAF manual editado (altera distância e local)
                ["att-manual-edit", "2026-11-01", "pista_400m", "720", "720", "2520", "", "", "", "Melhorou"],
                // Linha 6: TAF .FIT protegido (tenta mudar distância, mas só locationType/notes mudam)
                ["att-fit-prot", "2026-11-02", "rua_plana", "720", "720", "9999", "", "", "", "FIT obs edit"],
              ],
            },
          ],
        },
      });

      const res = await pullChangesFromSheets({ now: () => fixedNow });
      expect(res.pulledUpdated).toBe(1);
      expect(res.pulledLinked).toBe(1);
      expect(res.tafPulledUpdated).toBe(2);
      expect(res.skipped).toBe(4); // 1 invalid log + 1 invalid taf + 1 orphan taf + 1 same taf
      expect(res.warnings.length).toBeGreaterThanOrEqual(4);

      expect(mockPrisma.tafAttempt.update).toHaveBeenCalledWith({
        where: { id: "att-fit-prot" },
        data: {
          locationType: "rua_plana",
          notes: "FIT obs edit",
          syncedToSheetsAt: fixedNow,
        },
      });

      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-manual-merge" },
        data: expect.objectContaining({
          avgHeartRate: 155,
          maxHeartRate: 172,
          elevationGainM: 20,
          avgCadence: 174,
          shoeName: "Tenis X",
        }),
      });
    });

    it("em forceFullResync=true (onlyUnlinkedRows), pula linhas que já possuem ID em pullChangesFromSheets", async () => {
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      fakeSheets.spreadsheets.values.batchGet
        .mockResolvedValueOnce({
          data: {
            valueRanges: [
              {
                values: [
                  ["ID", "Data"],
                  ["uuid-ja-linkado", "2026-11-10", "manual", "longao", "12", "01:00:00"],
                ],
              },
              {
                values: [
                  ["ID", "Data"],
                  ["att-ja-linkado", "2026-11-10", "rua_plana", "720", "720", "2500"],
                ],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: { valueRanges: [{ values: [] }, { values: [] }] },
        });

      const res = await syncWithGoogleSheets({ forceFullResync: true }, { now: () => fixedNow });
      expect(res.warnings).toHaveLength(0);
      expect(res.skipped).toBe(0);
    });

    it("preserva checkpoint de chunks bem-sucedidos quando chunk posterior falha e limpa calorieMetadata ao remover peso", async () => {
      // 1) Falha no segundo chunk de append preserva updateMany dos primeiros 200 IDs
      const sessions205 = Array.from({ length: 205 }, (_, i) => ({
        id: `trn-p-${i}`,
        sessionDate: new Date("2026-01-01T09:00:00.000Z"),
        source: "manual",
        activityType: "corrida_continua",
        distanceKm: 5,
        durationSeconds: 1500,
        paceFormatted: "5:00",
        syncedToSheetsAt: null,
        updatedAt: fixedNow,
      }));
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce(sessions205);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });
      fakeSheets.spreadsheets.values.append
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error("HTTP 403 Forbidden"));

      await expect(
        syncHistoricalDataToSheets({ forceFullResync: false }, { now: () => fixedNow })
      ).rejects.toThrow("HTTP 403 Forbidden");

      expect(mockPrisma.trainingSession.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trainingSession.updateMany).toHaveBeenCalledWith({
        where: { id: { in: sessions205.slice(0, 200).map((s) => s.id) } },
        data: { syncedToSheetsAt: fixedNow },
      });

      // 2) Ao remover peso na planilha e sem peso no perfil/histórico, limpa calorieMetadata com Prisma.DbNull
      mockPrisma.userProfile.findFirst.mockResolvedValueOnce(null);
      mockPrisma.weightRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-clear-weight",
          sessionDate: new Date("2026-11-10T10:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          speedKmh: 12,
          paceSeconds: 300,
          paceFormatted: "5:00",
          bodyWeightKg: 75,
        },
      ]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data"],
                ["trn-clear-weight", "2026-11-10", "manual", "corrida_continua", "5,00", "00:25:00", "5:00", "", "", "", "", "", "", "", "Sem peso"],
              ],
            },
            { values: [] },
          ],
        },
      });

      await pullChangesFromSheets({ now: () => fixedNow });
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-clear-weight" },
        data: expect.objectContaining({
          bodyWeightKg: null,
          activeCalories: null,
          totalCalories: null,
          metValue: null,
          calorieMethod: null,
          calorieSource: null,
          calorieMetadata: Prisma.DbNull,
          syncedToSheetsAt: fixedNow,
        }),
      });
    });
  });

  describe("F. Garantia de Schema, Remoção Tolerante e Integridade de Deduplicação/Erros", () => {
    it("ensureSpreadsheetSchema cria abas ausentes e grava cabeçalhos RAW com cache por cliente", async () => {
      mockGetGoogleSheetsClient.mockReturnValue({
        sheets: fakeSheets,
        spreadsheetId: "spreadsheet-schema-new",
      });
      fakeSheets.spreadsheets.get.mockResolvedValueOnce({
        data: { sheets: [] },
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [] },
      });

      await syncTrainingSessionToSheet(
        {
          id: "trn-schema-1",
          sessionDate: new Date("2026-11-12T08:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          paceFormatted: "5:00",
        },
        { now: () => fixedNow }
      );

      expect(fakeSheets.spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-schema-new",
        requestBody: {
          requests: [
            { addSheet: { properties: { title: "Log_Treinos" } } },
            { addSheet: { properties: { title: "Simulados_TAF" } } },
            { addSheet: { properties: { title: "Perfil_e_Metas" } } },
          ],
        },
      });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-schema-new",
        requestBody: {
          valueInputOption: "RAW",
          data: [
            {
              range: "Log_Treinos!A1:O1",
              values: [[...SHEET_HEADERS.LOG_TREINOS]],
            },
            {
              range: "Simulados_TAF!A1:J1",
              values: [[...SHEET_HEADERS.SIMULADOS_TAF]],
            },
            {
              range: "Perfil_e_Metas!A1:I1",
              values: [[...SHEET_HEADERS.PERFIL_E_METAS]],
            },
          ],
        },
      });

      // Segunda chamada com o mesmo cliente usa cache WeakMap sem consultar spreadsheets.get novamente
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["trn-schema-1"]] },
      });
      await syncTrainingSessionToSheet(
        {
          id: "trn-schema-1",
          sessionDate: new Date("2026-11-12T08:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5.2,
          durationSeconds: 1560,
          paceFormatted: "5:00",
        },
        { now: () => fixedNow }
      );
      expect(fakeSheets.spreadsheets.get).toHaveBeenCalledTimes(1);
    });

    it("ensureSpreadsheetSchema preenche apenas cabeçalho da aba com Linha 1 vazia sem recriar abas existentes", async () => {
      mockGetGoogleSheetsClient.mockReturnValue({
        sheets: fakeSheets,
        spreadsheetId: "spreadsheet-partial-headers",
      });
      fakeSheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [
            { properties: { sheetId: 1, title: "Log_Treinos" } },
            { properties: { sheetId: 2, title: "Simulados_TAF" } },
            { properties: { sheetId: 3, title: "Perfil_e_Metas" } },
          ],
        },
      });
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            { values: [[""]] },
            { values: [[...SHEET_HEADERS.SIMULADOS_TAF]] },
            { values: [[...SHEET_HEADERS.PERFIL_E_METAS]] },
          ],
        },
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [] },
      });

      await syncTrainingSessionToSheet(
        {
          id: "trn-header-fix",
          sessionDate: new Date("2026-11-12T08:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 4,
          durationSeconds: 1200,
          paceFormatted: "5:00",
        },
        { now: () => fixedNow }
      );

      expect(fakeSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-partial-headers",
        requestBody: {
          valueInputOption: "RAW",
          data: [
            {
              range: "Log_Treinos!A1:O1",
              values: [[...SHEET_HEADERS.LOG_TREINOS]],
            },
          ],
        },
      });
    });

    it("deleteTrainingSessionFromSheet e deleteTafAttemptFromSheet retornam { deleted: false } se a aba estiver ausente", async () => {
      fakeSheets.spreadsheets.values.get.mockRejectedValueOnce(
        Object.assign(new Error("Unable to parse range: Log_Treinos!A2:A"), {
          response: { status: 400 },
        })
      );
      await expect(deleteTrainingSessionFromSheet("trn-no-tab")).resolves.toEqual({
        deleted: false,
        deletedCount: 0,
      });

      fakeSheets.spreadsheets.values.get.mockRejectedValueOnce(
        Object.assign(new Error("Requested entity was not found."), {
          code: 404,
        })
      );
      await expect(deleteTafAttemptFromSheet("att-no-tab")).resolves.toEqual({
        deleted: false,
        deletedCount: 0,
      });
    });

    it("previne colisão quando linha sem ID precede linha vinculada ao mesmo treino na planilha", async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValueOnce(null);
      mockPrisma.weightRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-dup",
          sessionDate: new Date("2026-11-10T10:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          speedKmh: 12,
          paceSeconds: 300,
          paceFormatted: "5:00",
          notes: "Original",
          updatedAt: new Date("2026-11-10T10:00:00.000Z"),
        },
      ]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data"],
                [
                  "",
                  "2026-11-10",
                  "manual",
                  "corrida_continua",
                  "5,00",
                  "00:25:00",
                  "5:00",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "Segunda corrida igual sem ID antes",
                ],
                [
                  "trn-dup",
                  "2026-11-10",
                  "manual",
                  "corrida_continua",
                  "5,00",
                  "00:25:00",
                  "5:00",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "Vinculada abaixo",
                ],
              ],
            },
            { values: [] },
          ],
        },
      });

      const res = await pullChangesFromSheets({
        now: () => fixedNow,
        generateId: () => "trn_unlinked_created",
      });

      expect(res.pulledLinked).toBe(0);
      expect(res.pulledCreated).toBe(1);
      expect(res.pulledUpdated).toBe(1);
      expect(mockPrisma.trainingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "trn_unlinked_created",
            notes: "Segunda corrida igual sem ID antes",
          }),
        })
      );
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "trn-dup" },
          data: expect.objectContaining({
            notes: "Vinculada abaixo",
          }),
        })
      );
    });

    it("usa tolerância exata de 50m em metros inteiros (5.10 vs 5.05) e recalcula calorias no merge de pull", async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValueOnce(null);
      mockPrisma.weightRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-50m-cal",
          sessionDate: new Date("2026-11-10T10:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5.05,
          durationSeconds: 1500,
          speedKmh: 12.12,
          paceSeconds: 297,
          paceFormatted: "4:57",
          bodyWeightKg: null,
          activeCalories: null,
          updatedAt: new Date("2026-11-10T10:00:00.000Z"),
        },
      ]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            {
              values: [
                ["ID", "Data"],
                [
                  "",
                  "2026-11-10",
                  "manual",
                  "corrida_continua",
                  "5,10",
                  "00:25:00",
                  "4:54",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "70,0",
                  "",
                  "Exatos 50m + peso",
                ],
              ],
            },
            { values: [] },
          ],
        },
      });

      const res = await pullChangesFromSheets({ now: () => fixedNow });
      expect(res.pulledLinked).toBe(1);
      expect(res.pulledCreated).toBe(0);
      expect(mockPrisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-50m-cal" },
        data: expect.objectContaining({
          bodyWeightKg: 70,
          activeCalories: expect.any(Number),
          totalCalories: expect.any(Number),
          metValue: expect.any(Number),
          calorieMethod: expect.any(String),
          syncedToSheetsAt: fixedNow,
        }),
      });
      const updateArg = mockPrisma.trainingSession.update.mock.calls[0][0];
      expect(updateArg.data.activeCalories).toBeGreaterThan(200);
    });

    it("preserva erro primário da API do Google se o checkpoint no finally também falhar", async () => {
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-ok-chunk",
          sessionDate: new Date("2026-11-10T09:00:00.000Z"),
          source: "manual",
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          paceFormatted: "5:00",
          syncedToSheetsAt: null,
          updatedAt: fixedNow,
        },
      ]);
      mockPrisma.tafAttempt.findMany.mockResolvedValueOnce([
        {
          id: "taf-err-chunk",
          testDate: new Date("2026-11-10T10:00:00.000Z"),
          source: "manual",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2500,
          speedKmh: 12.5,
          paceSeconds: 288,
          paceFormatted: "4:48",
          syncedToSheetsAt: null,
          updatedAt: fixedNow,
        },
      ]);
      mockPrisma.userProfile.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tafGoal.findFirst.mockResolvedValueOnce(null);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });
      fakeSheets.spreadsheets.values.append
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"));
      mockPrisma.trainingSession.updateMany.mockRejectedValueOnce(
        new Error("DB checkpoint lost")
      );

      await expect(
        syncHistoricalDataToSheets({ forceFullResync: false }, { now: () => fixedNow })
      ).rejects.toThrow("HTTP 503 Service Unavailable");
    });

    it("protege registros locais dirty contra sobrescrita no pull e contabiliza pushedUpdated/tafPushedUpdated no sync bidirecional", async () => {
      const syncedBefore = new Date("2026-11-10T10:00:00.000Z");
      const editedLocallyAfter = new Date("2026-11-14T11:30:00.000Z");

      const dirtyTraining = {
        id: "trn-dirty-bi",
        sessionDate: new Date("2026-11-10T09:00:00.000Z"),
        source: "manual",
        activityType: "corrida_continua",
        distanceKm: 8.5,
        durationSeconds: 2550,
        speedKmh: 12,
        paceSeconds: 300,
        paceFormatted: "5:00",
        notes: "Observação editada offline",
        syncedToSheetsAt: syncedBefore,
        updatedAt: editedLocallyAfter,
      };

      const dirtyAttempt = {
        id: "taf-dirty-bi",
        source: "manual",
        testDate: new Date("2026-11-11T09:00:00.000Z"),
        locationType: "pista_400m",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2720,
        speedKmh: 13.6,
        paceSeconds: 265,
        paceFormatted: "4:25",
        notes: "Distância corrigida local",
        syncedToSheetsAt: null,
        updatedAt: editedLocallyAfter,
      };

      // pullChangesFromSheets + syncHistoricalDataToSheets chamam findMany
      mockPrisma.trainingSession.findMany
        .mockResolvedValueOnce([dirtyTraining])
        .mockResolvedValueOnce([dirtyTraining]);
      mockPrisma.tafAttempt.findMany
        .mockResolvedValueOnce([dirtyAttempt])
        .mockResolvedValueOnce([dirtyAttempt]);
      mockPrisma.userProfile.findFirst.mockResolvedValue({
        name: "Atleta",
        currentWeightKg: 75,
        updatedAt: editedLocallyAfter,
      });
      mockPrisma.tafGoal.findFirst.mockResolvedValue({
        institutionName: "PF",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        targetExamDate: null,
      });
      mockPrisma.weightRecord.findFirst.mockResolvedValue(null);

      // 1º batchGet (pull) -> dados antigos no Sheets; 2º batchGet (push) -> IDs existentes na linha 2 + Perfil_e_Metas já igual
      fakeSheets.spreadsheets.values.batchGet
        .mockResolvedValueOnce({
          data: {
            valueRanges: [
              {
                values: [
                  ["ID", "Data"],
                  [
                    "trn-dirty-bi",
                    "2026-11-10",
                    "manual",
                    "corrida_continua",
                    "5,00",
                    "00:30:00",
                    "6:00",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "Dado obsoleto na planilha",
                  ],
                ],
              },
              {
                values: [
                  ["ID", "Data"],
                  [
                    "taf-dirty-bi",
                    "2026-11-11",
                    "rua_plana",
                    "720",
                    "720",
                    "2400",
                    "5:00",
                    "12.00",
                    "Aprovado (Mínimo)",
                    "TAF antigo no Sheets",
                  ],
                ],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            valueRanges: [
              { values: [["trn-dirty-bi"]] },
              { values: [["taf-dirty-bi"]] },
              { values: [["Atleta", "", "", "75", "PF", "2400", "2600", "12"]] },
            ],
          },
        });

      const report = await syncWithGoogleSheets(
        { direction: "bidirectional", forceFullResync: false },
        { now: () => fixedNow }
      );

      // Pull não sobrescreveu nenhum dos 2 registros locais dirty
      expect(report.pulledUpdated).toBe(0);
      expect(report.tafPulledUpdated).toBe(0);
      expect(report.skipped).toBe(2);
      expect(mockPrisma.trainingSession.update).not.toHaveBeenCalled();
      expect(mockPrisma.tafAttempt.update).not.toHaveBeenCalled();

      // Push subsequente enviou os dois registros e não reescreveu Perfil_e_Metas igual
      expect(report.pushedUpdated).toBe(1);
      expect(report.tafPushedUpdated).toBe(1);
      expect(report.pushedAppended).toBe(0);
      expect(report.tafPushedAppended).toBe(0);
      expect(report.profileSynced).toBe(false);
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledTimes(1);
      expect(fakeSheets.spreadsheets.values.update).not.toHaveBeenCalled();
    });

    it("detecta Perfil_e_Metas igual (profileSynced=false) vs divergente (profileSynced=true) em syncHistoricalDataToSheets", async () => {
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      mockPrisma.userProfile.findFirst.mockResolvedValue({
        name: "Atleta PaceLab",
        birthDate: new Date("1995-03-20T12:00:00.000Z"),
        heightCm: 175,
        currentWeightKg: 74.5,
      });
      mockPrisma.tafGoal.findFirst.mockResolvedValue({
        institutionName: "PF - Agente",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        targetExamDate: new Date("2026-12-01T12:00:00.000Z"),
      });
      mockPrisma.weightRecord.findFirst.mockResolvedValue(null);

      // Descobre idade calculada pelo mapper usando a data fake atual via getFullYear
      const nowYear = new Date().getFullYear();
      const expectedAge = nowYear - 1995;

      // Caso 1: Perfil_e_Metas já idêntico (formato pt-BR) -> não escreve nem marca profileSynced
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            { values: [] },
            { values: [] },
            {
              values: [
                [
                  "Atleta PaceLab",
                  String(expectedAge),
                  "175",
                  "74,5",
                  "PF - Agente",
                  "2400",
                  "2600",
                  "12",
                  "01/12/2026",
                ],
              ],
            },
          ],
        },
      });

      const sameRes = await syncHistoricalDataToSheets(
        { forceFullResync: false },
        { now: () => fixedNow }
      );
      expect(sameRes.profileSynced).toBe(false);
      expect(fakeSheets.spreadsheets.values.update).not.toHaveBeenCalled();

      // Caso 2: Meta alterada na planilha (ex.: alvo antigo era 2500m) -> escreve e marca profileSynced=true
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: {
          valueRanges: [
            { values: [] },
            { values: [] },
            {
              values: [
                [
                  "Atleta PaceLab",
                  String(expectedAge),
                  "175",
                  "74,5",
                  "PF - Agente",
                  "2400",
                  "2500",
                  "12",
                  "01/12/2026",
                ],
              ],
            },
          ],
        },
      });

      const diffRes = await syncHistoricalDataToSheets(
        { forceFullResync: false },
        { now: () => fixedNow }
      );
      expect(diffRes.profileSynced).toBe(true);
      expect(fakeSheets.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          range: "Perfil_e_Metas!A2:I2",
        })
      );
    });
  });

  describe("G. Plano_Semanal & Reconciliação Local (A3/A4/A8)", () => {
    it("degrada graciosamente quando aba Plano_Semanal não existe (HTTP 400 unable to parse range / 404) sem criar aba", async () => {
      fakeSheets.spreadsheets.values.get.mockRejectedValueOnce({
        status: 400,
        message: "Unable to parse range: Plano_Semanal!A2:I",
      });

      const pullRes = await pullWeeklyPlanFromSheets();
      expect(pullRes.sheetMissing).toBe(true);
      expect(pullRes.stats).toEqual({
        imported: 0,
        updated: 0,
        removed: 0,
        sheetMissingOrEmpty: true,
      });
      expect(pullRes.warnings).toHaveLength(0);
      expect(fakeSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();

      // Orquestrador syncWithGoogleSheets continua operando normalmente com batchGet [0..2] intacto
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      fakeSheets.spreadsheets.values.get.mockRejectedValueOnce({ status: 404, message: "Not Found" });
      fakeSheets.spreadsheets.values.batchGet
        .mockResolvedValueOnce({ data: { valueRanges: [{ values: [] }, { values: [] }] } })
        .mockResolvedValueOnce({
          data: {
            valueRanges: [
              { values: [] },
              { values: [] },
              { values: [["Kauan", "28", "178", "74,2", "PF Agente", "2400", "2600", "12", "15/02/2027"]] },
            ],
          },
        });

      const biReport = await syncWithGoogleSheets(
        { direction: "bidirectional", forceFullResync: false },
        { now: () => fixedNow }
      );
      expect(biReport.warnings).toHaveLength(0);
      expect(biReport.weeklyPlan).toEqual({
        imported: 0,
        updated: 0,
        removed: 0,
        matched: 0,
        missed: 0,
        pushed: 0,
        sheetMissingOrEmpty: true,
      });
      expect(fakeSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it("importa prescrições A-G, ignora Descanso/Off sem warnings, preserva matchedSessionId e limpa apenas pendências substituídas", async () => {
      let seq = 0;
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-new-1", "2026-11-17", "Terça", "Corrida Contínua", "6,5", "5:10", "Rodagem aeróbica"],
            ["plan-done-1", "2026-11-16", "Segunda", "Tempo Run", "8", "4:40", "Prescrição ajustada para 8km"],
            ["plan-off-1", "2026-11-18", "Quarta", "Descanso", "-", "-", "Recuperação passiva"],
            ["plan-new-1", "2026-11-19", "Quinta", "Longão", "12", "5:30", "Linha duplicada"],
          ],
        },
      });

      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-done-1",
          planExternalId: "plan-done-1",
          plannedDate: new Date("2026-11-16T12:00:00.000Z"),
          dayOfWeek: "Segunda",
          activityType: "tempo_run",
          targetDistanceKm: 6,
          targetPaceFormatted: "4:45",
          description: "Antiga descrição",
          status: "Concluído",
          matchedSessionId: "trn-concluido",
        },
        {
          id: "wp-removed-planned",
          planExternalId: "plan-removed-planned",
          plannedDate: new Date("2026-11-20T12:00:00.000Z"),
          dayOfWeek: "Sexta",
          activityType: "rodagem_leve",
          targetDistanceKm: 5,
          targetPaceFormatted: null,
          description: null,
          status: "Planejado",
          matchedSessionId: null,
        },
        {
          id: "wp-regenerated-missed",
          planExternalId: "plan-regenerated-missed",
          plannedDate: new Date("2026-11-18T12:00:00.000Z"),
          dayOfWeek: "Quarta",
          activityType: "longao",
          targetDistanceKm: 10,
          targetPaceFormatted: null,
          description: null,
          status: "Perdido",
          matchedSessionId: null,
        },
        {
          id: "wp-old-missed",
          planExternalId: "plan-old-missed",
          plannedDate: new Date("2026-11-04T12:00:00.000Z"),
          dayOfWeek: "Quarta",
          activityType: "corrida_continua",
          targetDistanceKm: 5,
          targetPaceFormatted: null,
          description: null,
          status: "Perdido",
          matchedSessionId: null,
        },
        {
          id: "wp-old-concluded",
          planExternalId: "plan-old-concluded",
          plannedDate: new Date("2026-11-05T12:00:00.000Z"),
          dayOfWeek: "Quinta",
          activityType: "tempo_run",
          targetDistanceKm: 6,
          targetPaceFormatted: null,
          description: null,
          status: "Concluído",
          matchedSessionId: "trn-old",
        },
      ]);
      mockPrisma.weeklyPlanItem.deleteMany.mockResolvedValueOnce({ count: 2 });

      const res = await pullWeeklyPlanFromSheets({
        generateId: () => `gen-wp-${++seq}`,
      });

      expect(res.stats).toEqual({
        imported: 1,
        updated: 1,
        removed: 2,
        sheetMissingOrEmpty: false,
      });
      expect(res.parsedCount).toBe(2);

      // Apenas 1 warning da linha duplicada; "Descanso" não gera warning nem persistência
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toMatchObject({
        tab: "Plano_Semanal",
        rowNumber: 5,
      });

      expect(mockPrisma.weeklyPlanItem.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.weeklyPlanItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "gen-wp-1",
          planExternalId: "plan-new-1",
          activityType: "corrida_continua",
          targetDistanceKm: 6.5,
          targetPaceFormatted: "5:10",
          status: "Planejado",
          matchedSessionId: null,
        }),
      });

      // Atualização preserva status e matchedSessionId (nunca sobrescreve com "Planejado")
      const updateCallArg = mockPrisma.weeklyPlanItem.update.mock.calls[0]?.[0];
      expect(updateCallArg?.where).toEqual({ id: "wp-done-1" });
      expect(updateCallArg?.data).toMatchObject({
        targetDistanceKm: 8,
        targetPaceFormatted: "4:40",
        description: "Prescrição ajustada para 8km",
      });
      expect(updateCallArg?.data).not.toHaveProperty("status");
      expect(updateCallArg?.data).not.toHaveProperty("matchedSessionId");

      // Limpou "wp-removed-planned" e "wp-regenerated-missed", preservando semana passada + concluído
      expect(mockPrisma.weeklyPlanItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["wp-removed-planned", "wp-regenerated-missed"] } },
      });
    });

    it("reconcilia 100% localmente em 2 passadas, reverte órfãos pós-DELETE e revalida sessão editada (PUT) sem colisão @unique", async () => {
      // Caso 1: órfão (matchedSessionId=null pós-DELETE com status "Concluído"), Passada 1, Passada 2 e Perdido
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-orphan-past",
          planExternalId: "p-orphan-past",
          plannedDate: new Date("2026-11-11T12:00:00.000Z"),
          activityType: "corrida_continua",
          targetDistanceKm: 5,
          status: "Concluído",
          matchedSessionId: null,
        },
        {
          id: "wp-pass1",
          planExternalId: "p-pass1",
          plannedDate: new Date("2026-11-14T12:00:00.000Z"),
          activityType: "tempo_run",
          targetDistanceKm: 6,
          status: "Planejado",
          matchedSessionId: null,
        },
        {
          id: "wp-pass2",
          planExternalId: "p-pass2",
          plannedDate: new Date("2026-11-12T12:00:00.000Z"),
          activityType: "longao",
          targetDistanceKm: 10,
          status: "Planejado",
          matchedSessionId: null,
        },
      ]);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-hoje",
          sessionDate: new Date("2026-11-14T10:00:00.000Z"),
          activityType: "tempo_run",
          distanceKm: 5.5,
          durationSeconds: 1650,
        },
        {
          id: "trn-ontem-longo",
          sessionDate: new Date("2026-11-13T10:00:00.000Z"),
          activityType: "longao",
          distanceKm: 5.0, // 50% de 10km -> Parcial em Passada 2 (+1 dia)
          durationSeconds: 1800,
        },
      ]);

      const rec1 = await reconcileWeeklyPlansWithSessions({ now: fixedNow });
      expect(rec1).toEqual({ matched: 2, missed: 1, updatedCount: 3 });

      // Zero chamadas ao Google Sheets durante reconciliação local!
      expect(fakeSheets.spreadsheets.values.get).not.toHaveBeenCalled();
      expect(fakeSheets.spreadsheets.values.batchGet).not.toHaveBeenCalled();
      expect(fakeSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();

      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-pass1" },
        data: { status: "Concluído", matchedSessionId: "trn-hoje" },
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-pass2" },
        data: { status: "Parcial", matchedSessionId: "trn-ontem-longo" },
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-orphan-past" },
        data: { status: "Perdido", matchedSessionId: null },
      });

      // Caso 2: editedSessionId movida de wpA (dia 14) para dia 15 onde existe wpB pendente
      // -> garante Phase 1 (matchedSessionId: null em wpA) ANTES de Phase 2 (matchedSessionId: "trn-edit" em wpB)
      vi.clearAllMocks();
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wpA",
          planExternalId: "p-a",
          plannedDate: new Date("2026-11-14T12:00:00.000Z"),
          activityType: "corrida_continua",
          targetDistanceKm: 5,
          status: "Concluído",
          matchedSessionId: "trn-edit",
        },
        {
          id: "wpB",
          planExternalId: "p-b",
          plannedDate: new Date("2026-11-15T12:00:00.000Z"),
          activityType: "corrida_continua",
          targetDistanceKm: 5,
          status: "Planejado",
          matchedSessionId: null,
        },
      ]);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-edit",
          sessionDate: new Date("2026-11-15T10:00:00.000Z"),
          activityType: "corrida_continua",
          distanceKm: 5.1,
          durationSeconds: 1500,
        },
      ]);

      const recEdit = await reconcileWeeklyPlansWithSessions({
        editedSessionId: "trn-edit",
        now: fixedNow,
      });
      expect(recEdit).toEqual({ matched: 1, missed: 0, updatedCount: 2 });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: "wpA" },
        data: { status: "Planejado", matchedSessionId: null },
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenNthCalledWith(2, {
        where: { id: "wpB" },
        data: { status: "Concluído", matchedSessionId: "trn-edit" },
      });

      // Caso 3: editedSessionId reduz distância para 50% no mesmo dia -> mantém vínculo e rebaixa para Parcial
      vi.clearAllMocks();
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-same",
          planExternalId: "p-same",
          plannedDate: new Date("2026-11-14T12:00:00.000Z"),
          activityType: "corrida_continua",
          targetDistanceKm: 10,
          status: "Concluído",
          matchedSessionId: "trn-edit",
        },
      ]);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-edit",
          sessionDate: new Date("2026-11-14T10:00:00.000Z"),
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
        },
      ]);

      const recShrink = await reconcileWeeklyPlansWithSessions({
        editedSessionId: "trn-edit",
        now: fixedNow,
      });
      expect(recShrink).toEqual({ matched: 0, missed: 0, updatedCount: 1 });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-same" },
        data: { status: "Parcial", matchedSessionId: "trn-edit" },
      });
    });

    it("pushWeeklyPlanStatusToSheets atualiza apenas colunas H:I e somente quando há divergência no Sheets", async () => {
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-1",
          planExternalId: "plan-1",
          plannedDate: new Date("2026-11-14T12:00:00.000Z"),
          activityType: "corrida_continua",
          status: "Concluído",
          matchedSessionId: "trn-1",
        },
        {
          id: "wp-2",
          planExternalId: "plan-2",
          plannedDate: new Date("2026-11-13T12:00:00.000Z"),
          activityType: "tempo_run",
          status: "Parcial",
          matchedSessionId: "trn-2",
        },
      ]);

      // Linha 2 já está igual no Sheets ("Concluído" + "trn-1"); linha 3 diverge ("Planejado" + "")
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-1", "2026-11-14", "Sábado", "Corrida Contínua", "5", "", "", "Concluído", "trn-1"],
            ["plan-2", "2026-11-13", "Sexta", "Tempo Run", "8", "", "", "Planejado", ""],
          ],
        },
      });

      const pushDiff = await pushWeeklyPlanStatusToSheets();
      expect(pushDiff).toEqual({ pushed: 1, sheetMissingOrEmpty: false });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledTimes(1);
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          valueInputOption: "RAW",
          data: [
            {
              range: "Plano_Semanal!H3:I3",
              values: [["Parcial", "trn-2"]],
            },
          ],
        },
      });

      // Se nenhuma linha diverge, batchUpdate NÃO é disparado
      vi.clearAllMocks();
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-1",
          planExternalId: "plan-1",
          status: "Concluído",
          matchedSessionId: "trn-1",
        },
      ]);
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-1", "2026-11-14", "Sábado", "Corrida Contínua", "5", "", "", "Concluído", "trn-1"],
          ],
        },
      });

      const pushNoop = await pushWeeklyPlanStatusToSheets();
      expect(pushNoop).toEqual({ pushed: 0, sheetMissingOrEmpty: false });
      expect(fakeSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();
    });

    it("orquestra syncWeeklyPlanFromSheets e syncWithGoogleSheets em pull e push corretamente", async () => {
      // 1) syncWeeklyPlanFromSheets reutiliza snapshot sem ler Plano_Semanal!A1:I duas vezes
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-s1", "2026-11-14", "Sábado", "Corrida Contínua", "5", "5:00", "Treino alvo", "Planejado", ""],
          ],
        },
      });
      const createdPlan = {
        id: "gen-wp-sync",
        planExternalId: "plan-s1",
        plannedDate: new Date("2026-11-14T12:00:00.000Z"),
        dayOfWeek: "Sábado",
        activityType: "corrida_continua",
        targetDistanceKm: 5,
        targetPaceFormatted: "5:00",
        description: "Treino alvo",
        status: "Planejado",
        matchedSessionId: null,
      };
      const matchedPlan = {
        ...createdPlan,
        status: "Concluído",
        matchedSessionId: "trn-match",
      };
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([]) // pullWeeklyPlanFromSheets
        .mockResolvedValueOnce([createdPlan]) // reconcileWeeklyPlansWithSessions
        .mockResolvedValueOnce([matchedPlan]); // pushWeeklyPlanStatusToSheets
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-match",
          sessionDate: new Date("2026-11-14T09:00:00.000Z"),
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
        },
      ]);

      const standalone = await syncWeeklyPlanFromSheets({
        now: () => fixedNow,
        generateId: () => "gen-wp-sync",
      });
      expect(standalone).toEqual({
        imported: 1,
        updated: 0,
        removed: 0,
        matched: 1,
        missed: 0,
        pushed: 1,
        sheetMissingOrEmpty: false,
        syncedPlans: 1,
      });
      expect(fakeSheets.spreadsheets.values.get).toHaveBeenCalledTimes(1);
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: [{ range: "Plano_Semanal!H2:I2", values: [["Concluído", "trn-match"]] }],
          }),
        })
      );

      // 2) direction: "pull" faz pull+reconcile+push H:I de Plano_Semanal conforme A4/Fase 3
      vi.clearAllMocks();
      mockPrisma.trainingSession.findMany.mockResolvedValue([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }] },
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-p1", "2026-11-11", "Quarta", "Rodagem Leve", "5", "", "Sessão perdida"],
          ],
        },
      });
      const pullPlanBase = {
        id: "wp-p1",
        planExternalId: "plan-p1",
        plannedDate: new Date("2026-11-11T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "rodagem_leve",
        targetDistanceKm: 5,
        targetPaceFormatted: null,
        description: "Sessão perdida",
        status: "Planejado",
        matchedSessionId: null,
      };
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([]) // pullWeeklyPlanFromSheets
        .mockResolvedValueOnce([pullPlanBase]) // reconcileWeeklyPlansWithSessions
        .mockResolvedValueOnce([{ ...pullPlanBase, status: "Perdido" }]); // pushWeeklyPlanStatusToSheets

      const pullReport = await syncWithGoogleSheets(
        { direction: "pull" },
        { now: () => fixedNow, generateId: () => "wp-p1" }
      );
      expect(pullReport.weeklyPlan).toEqual({
        imported: 1,
        updated: 0,
        removed: 0,
        matched: 0,
        missed: 1,
        pushed: 1,
        sheetMissingOrEmpty: false,
      });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          valueInputOption: "RAW",
          data: [{ range: "Plano_Semanal!H2:I2", values: [["Perdido", ""]] }],
        },
      });

      // 3) direction: "push" reconcilia localmente e envia H:I sem importar prescrições A:G
      vi.clearAllMocks();
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      mockPrisma.tafGoal.findFirst.mockResolvedValue(null);
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }, { values: [] }] },
      });
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([createdPlan]) // reconcile
        .mockResolvedValueOnce([matchedPlan]); // push
      mockPrisma.trainingSession.findMany
        .mockResolvedValueOnce([]) // syncHistoricalDataToSheets
        .mockResolvedValueOnce([
          {
            id: "trn-match",
            sessionDate: new Date("2026-11-14T09:00:00.000Z"),
            activityType: "corrida_continua",
            distanceKm: 5,
            durationSeconds: 1500,
          },
        ]); // reconcileWeeklyPlansWithSessions
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-s1", "2026-11-14", "Sábado", "Corrida Contínua", "5", "5:00", "Treino alvo", "Planejado", ""],
          ],
        },
      });

      const pushReport = await syncWithGoogleSheets(
        { direction: "push" },
        { now: () => fixedNow }
      );
      expect(pushReport.weeklyPlan).toEqual({
        imported: 0,
        updated: 0,
        removed: 0,
        matched: 1,
        missed: 0,
        pushed: 1,
        sheetMissingOrEmpty: false,
      });
      expect(mockPrisma.weeklyPlanItem.create).not.toHaveBeenCalled();
    });

    it("reconcileWeeklyPlansWithSessions reavalia editedSessionId entre múltiplos planos do mesmo dia e faz retry em P2002 transitório", async () => {
      const sameDayPlanA = {
        id: "wp-a",
        planExternalId: "plan-a",
        plannedDate: new Date("2026-11-18T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "rodagem_leve",
        targetDistanceKm: 5,
        status: "Concluído",
        matchedSessionId: "trn-edited",
      };
      const sameDayPlanB = {
        id: "wp-b",
        planExternalId: "plan-b",
        plannedDate: new Date("2026-11-18T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "tempo_run",
        targetDistanceKm: 10,
        status: "Planejado",
        matchedSessionId: null,
      };
      const editedSession = {
        id: "trn-edited",
        sessionDate: new Date("2026-11-18T10:00:00.000Z"),
        activityType: "tempo_run",
        distanceKm: 10,
        durationSeconds: 2700,
      };

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on matched_session_id",
        { code: "P2002", clientVersion: "5.22.0" }
      );

      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([sameDayPlanA, sameDayPlanB]) // 1ª tentativa (falha no $transaction)
        .mockResolvedValueOnce([sameDayPlanA, sameDayPlanB]); // 2ª tentativa (sucesso)
      mockPrisma.trainingSession.findMany
        .mockResolvedValueOnce([editedSession])
        .mockResolvedValueOnce([editedSession]);
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2002Error)
        .mockImplementationOnce(async (arg: unknown) =>
          (arg as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma)
        );

      const result = await reconcileWeeklyPlansWithSessions(
        { editedSessionId: "trn-edited" },
        { now: () => fixedNow }
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result.updatedCount).toBe(2);
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-a" },
        data: { status: "Planejado", matchedSessionId: null },
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-b" },
        data: { status: "Concluído", matchedSessionId: "trn-edited" },
      });
    });

    it("pullWeeklyPlanFromSheets auto-gera ID na coluna A, ignora duplicata com data inválida no snapshot, resolve título flexível e suporta linha 1 sem cabeçalho", async () => {
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["", "2026-11-18", "Quarta", "corrida_continua", "5", "~5:30/km", "Sem ID manual"], // auto-ID PLAN-2026-11-18-1 + write-back A2
            ["plan-dup-bad", "31/02/2026", "Quinta", "tempo_run", "8"], // aviso data inválida
            ["'plan-ok", "2026-11-18", "Quarta", "rodagem_leve", "5", "5:30", "Leve", "Concluído", "'trn-x"],
          ],
        },
      });
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-ok",
          planExternalId: "plan-ok",
          plannedDate: new Date("2026-11-18T12:00:00.000Z"),
          dayOfWeek: "Quarta",
          activityType: "rodagem_leve",
          targetDistanceKm: 5,
          targetPaceFormatted: "5:30",
          description: "Leve",
          status: "Concluído",
          matchedSessionId: "trn-x",
        },
      ]);

      const pullWithAutoId = await pullWeeklyPlanFromSheets({ now: () => fixedNow });
      expect(pullWithAutoId.stats).toEqual({
        imported: 1,
        updated: 0,
        removed: 0,
        sheetMissingOrEmpty: false,
      });
      expect(pullWithAutoId.warnings).toHaveLength(1);
      expect(pullWithAutoId.sheetSnapshots.has("PLAN-2026-11-18-1")).toBe(true);
      expect(pullWithAutoId.sheetSnapshots.get("plan-ok")?.matchedSessionIdText).toBe("trn-x");
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            valueInputOption: "RAW",
            data: [{ range: "Plano_Semanal!A2", values: [["PLAN-2026-11-18-1"]] }],
          }),
        })
      );
      expect(mockPrisma.weeklyPlanItem.update).not.toHaveBeenCalled();

      // Aba vazia retorna sheetMissingOrEmpty: true sem erros
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({ data: { values: [] } });
      const pullEmpty = await pullWeeklyPlanFromSheets();
      expect(pullEmpty.sheetMissing).toBe(false);
      expect(pullEmpty.stats.sheetMissingOrEmpty).toBe(true);

      // Snapshot de push ignora 1ª linha duplicada com data inválida e usa a 2ª linha válida
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-dup",
          planExternalId: "plan-dup",
          plannedDate: new Date("2026-11-18T12:00:00.000Z"),
          activityType: "corrida_continua",
          status: "Concluído",
          matchedSessionId: "trn-valid",
        },
      ]);
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-dup", "data-ruim", "Quarta", "corrida_continua", "5", "", "", "Planejado", ""],
            ["'plan-dup", "2026-11-18", "Quarta", "corrida_continua", "5", "", "", "Planejado", ""],
          ],
        },
      });

      const pushRes = await pushWeeklyPlanStatusToSheets();
      expect(pushRes).toEqual({ pushed: 1, sheetMissingOrEmpty: false });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: [{ range: "Plano_Semanal!H3:I3", values: [["Concluído", "trn-valid"]] }],
          }),
        })
      );

      // Descoberta resiliente quando aba se chama "Plano Semanal" e dados começam na linha 1 sem cabeçalho
      vi.clearAllMocks();
      fakeSheets.spreadsheets.values.get
        .mockRejectedValueOnce({ status: 400, message: "Unable to parse range: Plano_Semanal!A1:I" })
        .mockResolvedValueOnce({
          data: {
            values: [
              ["plan-no-hdr", "18/11/26", "Quarta", "rodagem_leve", "5", "~5:30/km", "Sem cabeçalho", "Planejado", ""],
            ],
          },
        });
      fakeSheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [{ properties: { sheetId: 9, title: "Plano Semanal" } }],
        },
      });
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "wp-nh",
            planExternalId: "plan-no-hdr",
            plannedDate: new Date("2026-11-18T12:00:00.000Z"),
            activityType: "rodagem_leve",
            targetDistanceKm: 5,
            status: "Concluído",
            matchedSessionId: "trn-nh",
          },
        ]);

      const pullFlex = await pullWeeklyPlanFromSheets({ now: () => fixedNow });
      expect(pullFlex.sheetMissing).toBe(false);
      expect(pullFlex.sheetTitle).toBe("Plano Semanal");
      expect(pullFlex.stats.imported).toBe(1);

      const pushFlex = await pushWeeklyPlanStatusToSheets(
        { now: () => fixedNow },
        {
          sheetMissing: pullFlex.sheetMissing,
          sheetTitle: pullFlex.sheetTitle,
          sheetSnapshots: pullFlex.sheetSnapshots,
        }
      );
      expect(pushFlex.pushed).toBe(1);
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: [{ range: "'Plano Semanal'!H1:I1", values: [["Concluído", "trn-nh"]] }],
          }),
        })
      );
    });

    it("classifica Adaptado via paceSeconds, grava H:I, protege Adaptado no pull e revalida quando prescrição muda", async () => {
      const fixedNow = new Date("2026-11-18T15:00:00.000Z");

      // 1) Reconciliação usa paceSeconds + targetPaceFormatted -> Adaptado + write-back H:I
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-pace-adp", "2026-11-18", "Quarta", "Rodagem Leve", "8", "5:45-6:00", "Rodagem Z2", "Planejado", ""],
          ],
        },
      });
      const planRow = {
        id: "wp-adp-1",
        planExternalId: "plan-pace-adp",
        plannedDate: new Date("2026-11-18T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "rodagem_leve",
        targetDistanceKm: 8,
        targetPaceFormatted: "5:45-6:00",
        description: "Rodagem Z2",
        status: "Planejado",
        matchedSessionId: null,
      };
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([]) // pull
        .mockResolvedValueOnce([planRow]) // reconcile
        .mockResolvedValueOnce([
          { ...planRow, status: "Adaptado", matchedSessionId: "trn-fast" },
        ]); // push
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-fast",
          sessionDate: new Date("2026-11-18T10:00:00.000Z"),
          activityType: "rodagem_leve",
          distanceKm: 8.1,
          durationSeconds: 2511,
          paceSeconds: 310, // 5:10/km -> 35s mais rápido que 5:45 (345s - 15s = 330s)
          paceFormatted: "5:10",
        },
      ]);

      const syncRes = await syncWeeklyPlanFromSheets({
        now: () => fixedNow,
        generateId: () => "wp-adp-1",
      });
      expect(syncRes).toEqual({
        imported: 1,
        updated: 0,
        removed: 0,
        matched: 1,
        adapted: 1,
        missed: 0,
        pushed: 1,
        sheetMissingOrEmpty: false,
        syncedPlans: 1,
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-adp-1" },
        data: { status: "Adaptado", matchedSessionId: "trn-fast" },
      });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: [{ range: "Plano_Semanal!H2:I2", values: [["Adaptado", "trn-fast"]] }],
          }),
        })
      );

      // 2) Pull protege item Adaptado ausente da planilha contra exclusão E reavalia vínculo quando prescrição muda
      vi.clearAllMocks();
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-reval", "2026-11-18", "Quarta", "Rodagem Leve", "8", "5:45-6:00", "Coach ajustou pace", "Concluído", "trn-linked"],
          ],
        },
      });
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-protected-adp",
          planExternalId: "plan-old-adp",
          plannedDate: new Date("2026-11-17T12:00:00.000Z"),
          dayOfWeek: "Terça",
          activityType: "rodagem_leve",
          targetDistanceKm: 6,
          targetPaceFormatted: "5:50",
          description: "Histórico adaptado sem vínculo",
          status: "Adaptado",
          matchedSessionId: null,
        },
        {
          id: "wp-reval",
          planExternalId: "plan-reval",
          plannedDate: new Date("2026-11-18T12:00:00.000Z"),
          dayOfWeek: "Quarta",
          activityType: "rodagem_leve",
          targetDistanceKm: 8,
          targetPaceFormatted: "5:00-5:20",
          description: "Antigo pace",
          status: "Concluído",
          matchedSessionId: "trn-linked",
        },
      ]);

      const pullRes = await pullWeeklyPlanFromSheets({ now: () => fixedNow });
      expect(pullRes.stats.updated).toBe(1);
      expect(pullRes.stats.removed).toBe(0);
      expect(mockPrisma.weeklyPlanItem.deleteMany).not.toHaveBeenCalled();

      // Reconciliação após atualização da prescrição reclassifica Concluído -> Adaptado
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-reval",
          planExternalId: "plan-reval",
          plannedDate: new Date("2026-11-18T12:00:00.000Z"),
          dayOfWeek: "Quarta",
          activityType: "rodagem_leve",
          targetDistanceKm: 8,
          targetPaceFormatted: "5:45-6:00",
          description: "Coach ajustou pace",
          status: "Concluído",
          matchedSessionId: "trn-linked",
        },
      ]);
      mockPrisma.trainingSession.findMany.mockResolvedValueOnce([
        {
          id: "trn-linked",
          sessionDate: new Date("2026-11-18T10:00:00.000Z"),
          activityType: "rodagem_leve",
          distanceKm: 8.0,
          durationSeconds: 2480,
          paceSeconds: 310,
          paceFormatted: "5:10",
        },
      ]);

      const revalRes = await reconcileWeeklyPlansWithSessions(undefined, { now: () => fixedNow });
      expect(revalRes).toEqual({
        matched: 0,
        adapted: 1,
        missed: 0,
        updatedCount: 1,
      });
      expect(mockPrisma.weeklyPlanItem.update).toHaveBeenCalledWith({
        where: { id: "wp-reval" },
        data: { status: "Adaptado", matchedSessionId: "trn-linked" },
      });
    });

    it("regressão auditoria: recalcula ID determinístico no snapshot sem col A, propaga 429 ao resolver aba e faz bootstrap no push com banco vazio", async () => {
      const fixedNow = new Date("2026-11-18T15:00:00.000Z");

      // 1) pushWeeklyPlanStatusToSheets encontra linha cujo col A ficou vazio (falha prévia no backfill)
      mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
        {
          id: "wp-noid",
          planExternalId: "PLAN-2026-11-18-1",
          status: "Concluído",
          matchedSessionId: "trn-noid",
        },
      ]);
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["", "2026-11-18", "Quarta", "Rodagem Leve", "6", "5:45", "Sem col A", "Planejado", ""],
          ],
        },
      });

      const pushNoColA = await pushWeeklyPlanStatusToSheets({ now: () => fixedNow });
      expect(pushNoColA).toEqual({ pushed: 1, sheetMissingOrEmpty: false });
      expect(fakeSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          valueInputOption: "RAW",
          data: [{ range: "Plano_Semanal!H2:I2", values: [["Concluído", "trn-noid"]] }],
        },
      });

      // 2) resolveWeeklyPlanTabTitle propaga 403/429/500 em vez de mascarar como sheetMissing
      vi.clearAllMocks();
      fakeSheets.spreadsheets.values.get.mockRejectedValueOnce({
        status: 400,
        message: "Unable to parse range: Plano_Semanal!A1:I",
      });
      fakeSheets.spreadsheets.get.mockRejectedValueOnce({
        status: 403,
        message: "Forbidden",
      });

      await expect(pullWeeklyPlanFromSheets({ now: () => fixedNow })).rejects.toMatchObject({
        status: 403,
      });

      // 3) direction: "push" com weekly_plan_items vazio faz bootstrap pullWeeklyPlanFromSheets
      vi.clearAllMocks();
      (mockPrisma.weeklyPlanItem as unknown as { count: ReturnType<typeof vi.fn> }).count =
        vi.fn().mockResolvedValueOnce(0);
      mockPrisma.trainingSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.tafAttempt.findMany.mockResolvedValue([]);
      mockPrisma.tafGoal.findFirst.mockResolvedValue(null);
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      fakeSheets.spreadsheets.values.batchGet.mockResolvedValueOnce({
        data: { valueRanges: [{ values: [] }, { values: [] }, { values: [] }] },
      });
      fakeSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["ID", "Data", "Dia da Semana", "Tipo", "Distância Alvo (km)", "Pace Alvo (min/km)", "Descrição / Observação", "Status", "ID Treino Realizado"],
            ["plan-boot-1", "2026-11-18", "Quarta", "Rodagem Leve", "6", "5:45", "Bootstrap push", "Planejado", ""],
          ],
        },
      });
      const bootPlan = {
        id: "wp-boot-1",
        planExternalId: "plan-boot-1",
        plannedDate: new Date("2026-11-18T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "rodagem_leve",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:45",
        description: "Bootstrap push",
        status: "Planejado",
        matchedSessionId: null,
      };
      mockPrisma.weeklyPlanItem.findMany
        .mockResolvedValueOnce([]) // bootstrap pull
        .mockResolvedValueOnce([bootPlan]) // reconcile
        .mockResolvedValueOnce([bootPlan]); // push

      const pushBootReport = await syncWithGoogleSheets(
        { direction: "push" },
        { now: () => fixedNow, generateId: () => "wp-boot-1" }
      );
      expect(pushBootReport.weeklyPlan?.imported).toBe(1);
    });
  });
});
