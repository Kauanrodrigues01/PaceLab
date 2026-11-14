import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIsGoogleSheetsConfigured,
  mockGetGoogleSheetsClient,
  mockGetSheetIdByTitle,
  mockPrisma,
} = vi.hoisted(() => ({
  mockIsGoogleSheetsConfigured: vi.fn(),
  mockGetGoogleSheetsClient: vi.fn(),
  mockGetSheetIdByTitle: vi.fn(),
  mockPrisma: {
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
  },
}));

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
  });
});
