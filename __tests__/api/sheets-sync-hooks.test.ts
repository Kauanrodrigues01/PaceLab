import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIsGoogleSheetsConfigured,
  mockSyncTrainingSessionToSheet,
  mockSyncTafAttemptToSheet,
  mockSyncProfileAndGoalToSheet,
  mockDeleteTrainingSessionFromSheet,
  mockDeleteTafAttemptFromSheet,
} = vi.hoisted(() => ({
  mockIsGoogleSheetsConfigured: vi.fn(() => true),
  mockSyncTrainingSessionToSheet: vi.fn(),
  mockSyncTafAttemptToSheet: vi.fn(),
  mockSyncProfileAndGoalToSheet: vi.fn(),
  mockDeleteTrainingSessionFromSheet: vi.fn(),
  mockDeleteTafAttemptFromSheet: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isGoogleSheetsConfigured: mockIsGoogleSheetsConfigured,
  };
});

vi.mock("@/lib/googleSheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/googleSheets")>();
  return {
    ...actual,
    syncTrainingSessionToSheet: mockSyncTrainingSessionToSheet,
    syncTafAttemptToSheet: mockSyncTafAttemptToSheet,
    syncProfileAndGoalToSheet: mockSyncProfileAndGoalToSheet,
    deleteTrainingSessionFromSheet: mockDeleteTrainingSessionFromSheet,
    deleteTafAttemptFromSheet: mockDeleteTafAttemptFromSheet,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainingSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tafAttempt: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tafGoal: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userProfile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    weightRecord: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { shouldSkipSheetsSync, syncRecordWithSheets } from "@/lib/api/sheetsSync";
import { POST as postTraining } from "@/app/api/taf/trainings/route";
import {
  PUT as putTraining,
  DELETE as deleteTraining,
} from "@/app/api/taf/trainings/[id]/route";
import { POST as postAttempt } from "@/app/api/taf/attempts/route";
import {
  PUT as putAttempt,
  DELETE as deleteAttempt,
} from "@/app/api/taf/attempts/[id]/route";
import { POST as postGoal } from "@/app/api/taf/goals/route";
import { GET as getProfile, PUT as putProfile } from "@/app/api/profile/route";
import { POST as postWeight } from "@/app/api/profile/weight/route";
import { DELETE as deleteWeight } from "@/app/api/profile/weight/[id]/route";

describe("Fase 4 — Hooks de Sincronização em Tempo Real nas Rotas REST", () => {
  const syncedDate = new Date("2026-11-14T15:30:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGoogleSheetsConfigured.mockReturnValue(true);
    mockSyncTrainingSessionToSheet.mockResolvedValue({
      syncedAt: syncedDate,
      action: "appended",
    });
    mockSyncTafAttemptToSheet.mockResolvedValue({
      syncedAt: syncedDate,
      action: "appended",
    });
    mockSyncProfileAndGoalToSheet.mockResolvedValue({
      syncedAt: syncedDate,
    });
    mockDeleteTrainingSessionFromSheet.mockResolvedValue({ deletedRows: 1 });
    mockDeleteTafAttemptFromSheet.mockResolvedValue({ deletedRows: 1 });
  });

  describe("Utilitário lib/api/sheetsSync.ts", () => {
    it("identifica ?skipSheetsSync=true e ?skipSheetsSync=1 e ignora valores falsos ou URLs inválidas", () => {
      expect(
        shouldSkipSheetsSync(
          new Request("http://localhost:3000/api/taf/trainings?skipSheetsSync=true")
        )
      ).toBe(true);
      expect(
        shouldSkipSheetsSync(
          new Request("http://localhost:3000/api/taf/trainings?skipSheetsSync=1")
        )
      ).toBe(true);
      expect(
        shouldSkipSheetsSync(
          new Request("http://localhost:3000/api/taf/trainings?skipSheetsSync=false")
        )
      ).toBe(false);
      expect(
        shouldSkipSheetsSync(new Request("http://localhost:3000/api/taf/trainings"))
      ).toBe(false);
      expect(shouldSkipSheetsSync({ url: "http://[invalid-host" } as Request)).toBe(false);
    });

    it("faz bypass quando skip=true ou integração desconfigurada", async () => {
      const baseRecord = { id: "rec-1", syncedToSheetsAt: null };
      const syncFn = vi.fn().mockResolvedValue({ syncedAt: syncedDate, action: "appended" });

      const skippedByFlag = await syncRecordWithSheets(baseRecord, syncFn, { skip: true });
      expect(skippedByFlag).toEqual(baseRecord);
      expect(syncFn).not.toHaveBeenCalled();

      mockIsGoogleSheetsConfigured.mockReturnValue(false);
      const skippedByEnv = await syncRecordWithSheets(baseRecord, syncFn);
      expect(skippedByEnv).toEqual(baseRecord);
      expect(syncFn).not.toHaveBeenCalled();
    });

    it("aceita syncedAt como Date ou string ISO e ignora data inválida sem quebrar", async () => {
      const baseRecord: { id: string; syncedToSheetsAt: Date | null } = {
        id: "rec-2",
        syncedToSheetsAt: null,
      };

      const fromDate = await syncRecordWithSheets(baseRecord, async () => ({
        syncedAt: syncedDate,
        action: "updated",
      }));
      expect(fromDate.syncedToSheetsAt?.toISOString()).toBe(syncedDate.toISOString());

      const fromString = await syncRecordWithSheets(baseRecord, async () => ({
        syncedAt: "2026-11-14T16:00:00.000Z" as unknown as Date,
        action: "updated",
      }));
      expect(fromString.syncedToSheetsAt?.toISOString()).toBe("2026-11-14T16:00:00.000Z");

      const fromInvalid = await syncRecordWithSheets(baseRecord, async () => ({
        syncedAt: "data-invalida" as unknown as Date,
        action: "updated",
      }));
      expect(fromInvalid.syncedToSheetsAt).toBeNull();
    });
  });

  describe("Rotas de Treinos (/api/taf/trainings e /api/taf/trainings/[id])", () => {
    const validTrainingBody = {
      activityType: "rodagem_leve",
      distanceKm: 5,
      durationSeconds: 1800,
      perceivedEffort: 6,
    };

    const baseTrainingRecord = {
      id: "trn-1",
      sessionDate: new Date("2026-11-14T08:00:00.000Z"),
      activityType: "rodagem_leve",
      source: "manual",
      externalId: null,
      syncedToSheetsAt: null,
      distanceKm: 5,
      durationSeconds: 1800,
      speedKmh: 10,
      paceSeconds: 360,
      paceFormatted: "6:00/km",
    };

    it("POST aguarda syncTrainingSessionToSheet antes de responder 201 e reflete syncedToSheetsAt", async () => {
      let syncCompletedBeforeResponse = false;
      vi.mocked(prisma.trainingSession.create).mockResolvedValue(baseTrainingRecord as never);
      mockSyncTrainingSessionToSheet.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        syncCompletedBeforeResponse = true;
        return { syncedAt: syncedDate, action: "appended" };
      });

      const res = await postTraining(
        new Request("http://localhost:3000/api/taf/trainings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validTrainingBody),
        })
      );

      expect(syncCompletedBeforeResponse).toBe(true);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(mockSyncTrainingSessionToSheet).toHaveBeenCalledWith(baseTrainingRecord);
      expect(json.data.syncedToSheetsAt).toBe(syncedDate.toISOString());
    });

    it("POST com id (upsert) e POST com onDuplicate=update disparam syncTrainingSessionToSheet", async () => {
      vi.mocked(prisma.trainingSession.upsert).mockResolvedValue({
        ...baseTrainingRecord,
        id: "trn-upsert",
      } as never);

      const upsertRes = await postTraining(
        new Request("http://localhost:3000/api/taf/trainings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...validTrainingBody, id: "trn-upsert" }),
        })
      );
      expect(upsertRes.status).toBe(201);
      expect((await upsertRes.json()).data.syncedToSheetsAt).toBe(syncedDate.toISOString());

      vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue({
        ...baseTrainingRecord,
        id: "trn-ext",
        externalId: "gpx_123",
        splits: [],
      } as never);
      vi.mocked(prisma.trainingSession.update).mockResolvedValue({
        ...baseTrainingRecord,
        id: "trn-ext",
        externalId: "gpx_123",
      } as never);

      const updateRes = await postTraining(
        new Request("http://localhost:3000/api/taf/trainings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...validTrainingBody,
            externalId: "gpx_123",
            onDuplicate: "update",
          }),
        })
      );
      expect(updateRes.status).toBe(200);
      expect((await updateRes.json()).data.syncedToSheetsAt).toBe(syncedDate.toISOString());
      expect(mockSyncTrainingSessionToSheet).toHaveBeenCalledTimes(2);
    });

    it("POST com ?skipSheetsSync=true ignora Google Sheets e erro no Sheets não derruba criação", async () => {
      vi.mocked(prisma.trainingSession.create).mockResolvedValue(baseTrainingRecord as never);

      const skippedRes = await postTraining(
        new Request("http://localhost:3000/api/taf/trainings?skipSheetsSync=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validTrainingBody),
        })
      );
      expect(skippedRes.status).toBe(201);
      expect(mockSyncTrainingSessionToSheet).not.toHaveBeenCalled();
      expect((await skippedRes.json()).data.syncedToSheetsAt).toBeNull();

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockSyncTrainingSessionToSheet.mockRejectedValueOnce(new Error("Sheets 503"));

      const resilientRes = await postTraining(
        new Request("http://localhost:3000/api/taf/trainings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validTrainingBody),
        })
      );
      expect(resilientRes.status).toBe(201);
      expect((await resilientRes.json()).data.syncedToSheetsAt).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith("[SheetsSync]", expect.any(Error));
      errorSpy.mockRestore();
    });

    it("PUT reseta syncedToSheetsAt para null quando omitido e atualiza no retorno em caso de sucesso", async () => {
      vi.mocked(prisma.trainingSession.update).mockResolvedValue(baseTrainingRecord as never);

      const res = await putTraining(
        new Request("http://localhost:3000/api/taf/trainings/trn-1", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Treino forte" }),
        }),
        { params: { id: "trn-1" } }
      );

      expect(res.status).toBe(200);
      expect(prisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-1" },
        data: { notes: "Treino forte", syncedToSheetsAt: null },
      });
      expect(mockSyncTrainingSessionToSheet).toHaveBeenCalledWith(baseTrainingRecord);
      expect((await res.json()).data.syncedToSheetsAt).toBe(syncedDate.toISOString());
    });

    it("DELETE aguarda deleteTrainingSessionFromSheet e é não-bloqueante em caso de falha externa", async () => {
      vi.mocked(prisma.trainingSession.delete).mockResolvedValue(baseTrainingRecord as never);

      const resOk = await deleteTraining(
        new Request("http://localhost:3000/api/taf/trainings/trn-1", { method: "DELETE" }),
        { params: { id: "trn-1" } }
      );
      expect(resOk.status).toBe(200);
      expect(mockDeleteTrainingSessionFromSheet).toHaveBeenCalledWith("trn-1");

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockDeleteTrainingSessionFromSheet.mockRejectedValueOnce(new Error("Sheets Offline"));

      const resFallback = await deleteTraining(
        new Request("http://localhost:3000/api/taf/trainings/trn-1", { method: "DELETE" }),
        { params: { id: "trn-1" } }
      );
      expect(resFallback.status).toBe(200);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("Rotas de Simulados TAF (/api/taf/attempts e /api/taf/attempts/[id])", () => {
    const validAttemptBody = {
      actualDurationSeconds: 720,
      distanceMeters: 2500,
      targetDurationSeconds: 720,
    };

    const baseAttemptRecord = {
      id: "att-1",
      testDate: new Date("2026-11-14T09:00:00.000Z"),
      source: "manual",
      externalId: null,
      syncedToSheetsAt: null,
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2500,
      speedKmh: 12.5,
      paceSeconds: 288,
      paceFormatted: "4:48/km",
    };

    it("POST aguarda syncTafAttemptToSheet em create/onDuplicate e respeita ?skipSheetsSync=true", async () => {
      vi.mocked(prisma.tafAttempt.create).mockResolvedValue(baseAttemptRecord as never);

      const createdRes = await postAttempt(
        new Request("http://localhost:3000/api/taf/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validAttemptBody),
        })
      );
      expect(createdRes.status).toBe(201);
      expect((await createdRes.json()).data.syncedToSheetsAt).toBe(syncedDate.toISOString());

      vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValue({
        ...baseAttemptRecord,
        id: "att-ext",
        externalId: "fit_1",
        laps: [],
      } as never);
      vi.mocked(prisma.tafAttempt.update).mockResolvedValue({
        ...baseAttemptRecord,
        id: "att-ext",
        externalId: "fit_1",
      } as never);

      const updatedRes = await postAttempt(
        new Request("http://localhost:3000/api/taf/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...validAttemptBody,
            externalId: "fit_1",
            onDuplicate: "update",
          }),
        })
      );
      expect(updatedRes.status).toBe(200);
      expect((await updatedRes.json()).data.syncedToSheetsAt).toBe(syncedDate.toISOString());

      const skippedRes = await postAttempt(
        new Request("http://localhost:3000/api/taf/attempts?skipSheetsSync=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validAttemptBody),
        })
      );
      expect(skippedRes.status).toBe(201);
      expect(mockSyncTafAttemptToSheet).toHaveBeenCalledTimes(2);
    });

    it("PUT e DELETE em /api/taf/attempts/[id] sincronizam com fallback não-bloqueante", async () => {
      vi.mocked(prisma.tafAttempt.update).mockResolvedValue(baseAttemptRecord as never);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockSyncTafAttemptToSheet.mockRejectedValueOnce(new Error("Quota 429"));

      const putFailRes = await putAttempt(
        new Request("http://localhost:3000/api/taf/attempts/att-1", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ distanceMeters: 2550 }),
        }),
        { params: { id: "att-1" } }
      );
      expect(putFailRes.status).toBe(200);
      expect(prisma.tafAttempt.update).toHaveBeenCalledWith({
        where: { id: "att-1" },
        data: { distanceMeters: 2550, syncedToSheetsAt: null },
      });
      expect((await putFailRes.json()).data.syncedToSheetsAt).toBeNull();

      vi.mocked(prisma.tafAttempt.delete).mockResolvedValue(baseAttemptRecord as never);
      mockDeleteTafAttemptFromSheet.mockRejectedValueOnce(new Error("Sheets timeout"));

      const delRes = await deleteAttempt(
        new Request("http://localhost:3000/api/taf/attempts/att-1", { method: "DELETE" }),
        { params: { id: "att-1" } }
      );
      expect(delRes.status).toBe(200);
      expect(mockDeleteTafAttemptFromSheet).toHaveBeenCalledWith("att-1");
      errorSpy.mockRestore();
    });
  });

  describe("Rotas de Perfil, Metas e Peso (/api/taf/goals, /api/profile, /api/profile/weight*)", () => {
    it("POST /api/taf/goals aguarda syncProfileAndGoalToSheet e não falha se Sheets falhar", async () => {
      const savedGoal = {
        id: "goal-1",
        institutionName: "PF",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
      };
      vi.mocked(prisma.tafGoal.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tafGoal.create).mockResolvedValue(savedGoal as never);

      let syncDoneBeforeReturn = false;
      mockSyncProfileAndGoalToSheet.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        syncDoneBeforeReturn = true;
        return { syncedAt: syncedDate };
      });

      const okRes = await postGoal(
        new Request("http://localhost:3000/api/taf/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ institutionName: "PF", targetDistanceMeters: 2600 }),
        })
      );
      expect(okRes.status).toBe(200);
      expect(syncDoneBeforeReturn).toBe(true);
      expect(mockSyncProfileAndGoalToSheet).toHaveBeenCalledTimes(1);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockSyncProfileAndGoalToSheet.mockRejectedValueOnce(new Error("Sheets error"));
      const errRes = await postGoal(
        new Request("http://localhost:3000/api/taf/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ institutionName: "PF", targetDistanceMeters: 2600 }),
        })
      );
      expect(errRes.status).toBe(200);
      errorSpy.mockRestore();
    });

    it("GET /api/profile não sincroniza, enquanto PUT /api/profile aguarda syncProfileAndGoalToSheet", async () => {
      const profile = {
        id: "prof-1",
        name: "Atleta",
        heightCm: 175,
        currentWeightKg: 72,
        _count: { weightRecords: 1 },
      };
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValue(profile as never);

      const getRes = await getProfile();
      expect(getRes.status).toBe(200);
      expect(mockSyncProfileAndGoalToSheet).not.toHaveBeenCalled();

      vi.mocked(prisma.userProfile.update).mockResolvedValue(profile as never);
      const putRes = await putProfile(
        new Request("http://localhost:3000/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Atleta", heightCm: 176 }),
        })
      );
      expect(putRes.status).toBe(200);
      expect(mockSyncProfileAndGoalToSheet).toHaveBeenCalledTimes(1);
    });

    it("POST /api/profile/weight e DELETE /api/profile/weight/[id] sincronizam Perfil_e_Metas apenas quando aplicável", async () => {
      const profile = { id: "prof-1", currentWeightKg: 72 };
      const weightRecord = {
        id: "w-1",
        profileId: "prof-1",
        weightKg: 71.5,
        recordedAt: new Date("2026-11-14T10:00:00.000Z"),
        source: "manual",
        notes: null,
      };
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValue(profile as never);
      vi.mocked(prisma.weightRecord.create).mockResolvedValue(weightRecord as never);
      vi.mocked(prisma.weightRecord.findFirst).mockResolvedValue(weightRecord as never);
      vi.mocked(prisma.userProfile.update).mockResolvedValue({
        ...profile,
        currentWeightKg: 71.5,
      } as never);

      const postRes = await postWeight(
        new Request("http://localhost:3000/api/profile/weight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weightKg: 71.5 }),
        })
      );
      expect(postRes.status).toBe(201);
      expect(mockSyncProfileAndGoalToSheet).toHaveBeenCalledTimes(1);

      vi.mocked(prisma.weightRecord.findUnique).mockResolvedValueOnce(null);
      const notFoundDelRes = await deleteWeight(
        new Request("http://localhost:3000/api/profile/weight/missing", { method: "DELETE" }),
        { params: { id: "missing" } }
      );
      expect(notFoundDelRes.status).toBe(200);
      expect(mockSyncProfileAndGoalToSheet).toHaveBeenCalledTimes(1);

      vi.mocked(prisma.weightRecord.findUnique).mockResolvedValueOnce(weightRecord as never);
      vi.mocked(prisma.weightRecord.delete).mockResolvedValueOnce(weightRecord as never);
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValueOnce(profile as never);
      vi.mocked(prisma.weightRecord.findFirst).mockResolvedValueOnce(null);

      const delRes = await deleteWeight(
        new Request("http://localhost:3000/api/profile/weight/w-1", { method: "DELETE" }),
        { params: { id: "w-1" } }
      );
      expect(delRes.status).toBe(200);
      expect(mockSyncProfileAndGoalToSheet).toHaveBeenCalledTimes(2);
    });
  });
});
