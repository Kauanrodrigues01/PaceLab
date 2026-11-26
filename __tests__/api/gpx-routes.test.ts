import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { GET as getTrainings, POST as postTraining } from "@/app/api/taf/trainings/route";
import { PUT as putTraining } from "@/app/api/taf/trainings/[id]/route";
import { POST as postAttempt } from "@/app/api/taf/attempts/route";
import { PUT as putAttempt } from "@/app/api/taf/attempts/[id]/route";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainingSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    tafAttempt: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    weeklyPlanItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("API Routes — Telemetria GPX, Origem e Anti-Duplicação (Fase 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Trainings: GET & POST & PUT ───────────────────────────────────────────
  describe("Trainings (/api/taf/trainings & /api/taf/trainings/[id])", () => {
    const baseExistingGpxTraining = {
      id: "trn-existing-gpx",
      userId: null,
      source: "gpx_upload" as const,
      externalId: "gpx_abc123def456",
      syncedToSheetsAt: null,
      sessionDate: new Date("2026-11-13T09:15:02Z"),
      activityType: "tempo_run" as const,
      distanceKm: 5.42,
      durationSeconds: 1500,
      elapsedSeconds: 1620,
      speedKmh: 13.01,
      paceSeconds: 277,
      paceFormatted: "4:37",
      avgHeartRate: 164,
      maxHeartRate: 182,
      elevationGainM: 42.5,
      avgCadence: 174,
      shoeName: "Nike Vaporfly 3",
      perceivedEffort: 8,
      bodyWeightKg: 74.5,
      notes: "Treino de ritmo matinal com boas parciais",
      splits: [
        {
          kilometer: 1,
          distanceKm: 1.0,
          durationSeconds: 278,
          paceSeconds: 278,
          paceFormatted: "4:38",
          avgHeartRate: 160,
          elevationDiffM: 6.2,
        },
      ],
      activeCalories: 380,
      totalCalories: 412,
      metValue: 11.8,
      calorieMethod: "compendium_2024_met",
      calorieSource: "auto_calculated",
      calorieMetadata: { compendiumCode: "12080", version: "2024" },
      createdAt: new Date("2026-11-13T10:00:00Z"),
      updatedAt: new Date("2026-11-13T10:00:00Z"),
    };

    it("GET aceita filtro por todos os 6 valores de ActivityType e retorna novos campos", async () => {
      for (const act of [
        "rodagem_leve",
        "corrida_continua",
        "tempo_run",
        "corrida_intervalada",
        "longao",
        "caminhada",
      ] as const) {
        vi.mocked(prisma.trainingSession.findMany).mockResolvedValueOnce([
          { ...baseExistingGpxTraining, activityType: act },
        ] as never);

        const req = new Request(`http://localhost/api/taf/trainings?activityType=${act}`);
        const res = await getTrainings(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data[0].activityType).toBe(act);
        expect(json.data[0].source).toBe("gpx_upload");
        expect(json.data[0].avgHeartRate).toBe(164);
        expect(prisma.trainingSession.findMany).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: { activityType: act },
          })
        );
      }
    });

    it("POST manual (regressão): grava source='manual' e campos de telemetria nulos sem chamar findUnique", async () => {
      vi.mocked(prisma.trainingSession.create).mockResolvedValueOnce({
        ...baseExistingGpxTraining,
        id: "trn-manual-1",
        source: "manual",
        externalId: null,
        activityType: "rodagem_leve",
      } as never);

      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          activityType: "rodagem_leve",
          distanceKm: 6.0,
          durationSeconds: 1980,
          perceivedEffort: 5,
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(prisma.trainingSession.findUnique).not.toHaveBeenCalled();
      expect(prisma.trainingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "manual",
            externalId: null,
            activityType: "rodagem_leve",
            elapsedSeconds: null,
            avgHeartRate: null,
            maxHeartRate: null,
            elevationGainM: null,
            avgCadence: null,
            shoeName: null,
          }),
        })
      );
    });

    it("POST GPX inédito: persiste telemetria completa, splits enriquecidos e source='gpx_upload' (201)", async () => {
      vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.trainingSession.create).mockResolvedValueOnce(
        baseExistingGpxTraining as never
      );

      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_abc123def456",
          sessionDate: "2026-11-13T09:15:02Z",
          activityType: "tempo_run",
          distanceKm: 5.42,
          durationSeconds: 1500,
          elapsedSeconds: 1620,
          speedKmh: 13.01,
          paceSeconds: 277,
          paceFormatted: "4:37",
          avgHeartRate: 164,
          maxHeartRate: 182,
          elevationGainM: 42.5,
          avgCadence: 174,
          shoeName: "Nike Vaporfly 3",
          perceivedEffort: 8,
          bodyWeightKg: 74.5,
          notes: "Treino de ritmo matinal com boas parciais",
          splits: baseExistingGpxTraining.splits,
          activeCalories: 380,
          totalCalories: 412,
          metValue: 11.8,
          calorieMethod: "compendium_2024_met",
          calorieSource: "auto_calculated",
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(prisma.trainingSession.findUnique).toHaveBeenCalledWith({
        where: { externalId: "gpx_abc123def456" },
      });
      expect(prisma.trainingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "gpx_upload",
            externalId: "gpx_abc123def456",
            elapsedSeconds: 1620,
            avgHeartRate: 164,
            maxHeartRate: 182,
            elevationGainM: 42.5,
            avgCadence: 174,
            shoeName: "Nike Vaporfly 3",
          }),
        })
      );
    });

    it("POST GPX duplicado sem onDuplicate='update' retorna 409 com existingId nos details", async () => {
      vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce(
        baseExistingGpxTraining as never
      );

      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_abc123def456",
          activityType: "tempo_run",
          distanceKm: 5.42,
          durationSeconds: 1500,
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.code).toBe("DUPLICATE_EXTERNAL_ID");
      expect(json.error).toBe("Este arquivo .GPX já foi importado");
      expect(json.details).toEqual({
        existingId: "trn-existing-gpx",
        code: "DUPLICATE_EXTERNAL_ID",
      });
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    });

    it("POST FIT inédito e duplicado: aceita source='fit_upload' e retorna 409 com mensagem específica de .FIT", async () => {
      vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce({
        ...baseExistingGpxTraining,
        id: "trn-existing-fit",
        source: "fit_upload",
        externalId: "fit_1234567890abcdef",
      } as never);

      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          source: "fit_upload",
          externalId: "fit_1234567890abcdef",
          activityType: "tempo_run",
          distanceKm: 5.0,
          durationSeconds: 1500,
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.code).toBe("DUPLICATE_EXTERNAL_ID");
      expect(json.error).toBe("Este arquivo .FIT já foi importado");
      expect(json.details).toEqual({
        existingId: "trn-existing-fit",
        code: "DUPLICATE_EXTERNAL_ID",
      });
    });

    it("POST GPX duplicado com onDuplicate='update' atualiza registro existente preservando campos subjetivos omitidos", async () => {
      vi.mocked(prisma.trainingSession.findUnique).mockResolvedValueOnce(
        baseExistingGpxTraining as never
      );
      vi.mocked(prisma.trainingSession.update).mockResolvedValueOnce({
        ...baseExistingGpxTraining,
        distanceKm: 5.43,
        durationSeconds: 1498,
        avgHeartRate: 165,
      } as never);

      // Reenvio do GPX sem enviar perceivedEffort, bodyWeightKg, notes, shoeName ou activityType
      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_abc123def456",
          onDuplicate: "update",
          distanceKm: 5.43,
          durationSeconds: 1498,
          elapsedSeconds: 1620,
          avgHeartRate: 165,
          maxHeartRate: 183,
          elevationGainM: 43.0,
          avgCadence: 176,
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(prisma.trainingSession.update).toHaveBeenCalledWith({
        where: { id: "trn-existing-gpx" },
        data: expect.objectContaining({
          distanceKm: 5.43,
          durationSeconds: 1498,
          avgHeartRate: 165,
          // Campos subjetivos e de data/splits preservados do registro existente:
          sessionDate: baseExistingGpxTraining.sessionDate,
          activityType: "tempo_run",
          perceivedEffort: 8,
          bodyWeightKg: 74.5,
          notes: "Treino de ritmo matinal com boas parciais",
          shoeName: "Nike Vaporfly 3",
          splits: baseExistingGpxTraining.splits,
          activeCalories: 380,
          totalCalories: 412,
        }),
      });
    });

    it("POST GPX trata corrida de requisições (race P2002) retornando 409 amigável", async () => {
      // 1º findUnique não acha nada; create falha com P2002 porque outra req inseriu antes; 2º findUnique acha o id
      vi.mocked(prisma.trainingSession.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(baseExistingGpxTraining as never);

      const p2002 = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`external_id`)",
        {
          code: "P2002",
          clientVersion: "6.0.0",
          meta: { target: ["external_id"] },
        }
      );
      vi.mocked(prisma.trainingSession.create).mockRejectedValueOnce(p2002);

      const req = new Request("http://localhost/api/taf/trainings", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_abc123def456",
          activityType: "longao",
          distanceKm: 15,
          durationSeconds: 4500,
        }),
      });

      const res = await postTraining(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Este arquivo .GPX já foi importado");
      expect(json.details).toEqual({
        existingId: "trn-existing-gpx",
        code: "DUPLICATE_EXTERNAL_ID",
      });
    });

    it("PUT /api/taf/trainings/[id] atualiza telemetria, preserva splits omitidos e ignora source/externalId (A16/A17)", async () => {
      vi.mocked(prisma.trainingSession.update).mockResolvedValueOnce({
        ...baseExistingGpxTraining,
        perceivedEffort: 9,
        shoeName: "Adidas Adios Pro 3",
        avgHeartRate: 168,
      } as never);

      const req = new Request("http://localhost/api/taf/trainings/trn-existing-gpx", {
        method: "PUT",
        body: JSON.stringify({
          perceivedEffort: 9,
          shoeName: "Adidas Adios Pro 3",
          avgHeartRate: 168,
          source: "manual",
          externalId: "gpx_hack_attempt",
        }),
      });

      const res = await putTraining(req, { params: { id: "trn-existing-gpx" } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      const updateCall = vi.mocked(prisma.trainingSession.update).mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: "trn-existing-gpx" });
      expect(updateCall.data).toEqual({
        perceivedEffort: 9,
        shoeName: "Adidas Adios Pro 3",
        avgHeartRate: 168,
        syncedToSheetsAt: null,
      });
      expect("source" in updateCall.data).toBe(false);
      expect("externalId" in updateCall.data).toBe(false);
      expect("splits" in updateCall.data).toBe(false);
      expect("activityType" in updateCall.data).toBe(false);
    });
  });

  // ─── Attempts: POST & PUT com campos GPX ───────────────────────────────────
  describe("Attempts (/api/taf/attempts & /api/taf/attempts/[id])", () => {
    const existingGpxAttempt = {
      id: "att-gpx-1",
      userId: null,
      source: "gpx_upload" as const,
      externalId: "gpx_taf12min_hash",
      testDate: new Date("2026-11-13T10:00:00Z"),
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2680,
      speedKmh: 13.4,
      paceSeconds: 269,
      paceFormatted: "4:29",
      locationType: "pista_400m",
      shoeName: "Nike Streakfly",
      avgHeartRate: 178,
      maxHeartRate: 192,
      notes: "Simulado forte a partir do GPX",
      laps: [],
      createdAt: new Date("2026-11-13T10:20:00Z"),
      updatedAt: new Date("2026-11-13T10:20:00Z"),
    };

    it("POST /api/taf/attempts salva campos GPX (source, externalId, shoeName, avgHeartRate, maxHeartRate)", async () => {
      vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.tafAttempt.create).mockResolvedValueOnce(existingGpxAttempt as never);

      const req = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_taf12min_hash",
          actualDurationSeconds: 720,
          distanceMeters: 2680,
          locationType: "pista_400m",
          shoeName: "Nike Streakfly",
          avgHeartRate: 178,
          maxHeartRate: 192,
        }),
      });

      const res = await postAttempt(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(prisma.tafAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "gpx_upload",
            externalId: "gpx_taf12min_hash",
            shoeName: "Nike Streakfly",
            avgHeartRate: 178,
            maxHeartRate: 192,
          }),
        })
      );
    });

    it("POST /api/taf/attempts retorna 409 quando externalId já existe e atualiza quando onDuplicate='update'", async () => {
      vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValueOnce(existingGpxAttempt as never);

      const conflictReq = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_taf12min_hash",
          actualDurationSeconds: 720,
          distanceMeters: 2680,
        }),
      });

      const conflictRes = await postAttempt(conflictReq);
      const conflictJson = await conflictRes.json();

      expect(conflictRes.status).toBe(409);
      expect(conflictJson.code).toBe("DUPLICATE_EXTERNAL_ID");
      expect(conflictJson.error).toBe("Este arquivo .GPX já foi importado");
      expect(conflictJson.details).toEqual({
        existingId: "att-gpx-1",
        code: "DUPLICATE_EXTERNAL_ID",
      });

      // Agora com onDuplicate='update'
      vi.mocked(prisma.tafAttempt.findUnique).mockResolvedValueOnce({
        ...existingGpxAttempt,
        targetDurationSeconds: 900,
      } as never);
      vi.mocked(prisma.tafAttempt.update).mockResolvedValueOnce({
        ...existingGpxAttempt,
        targetDurationSeconds: 900,
        distanceMeters: 2690,
      } as never);

      const updateReq = new Request("http://localhost/api/taf/attempts", {
        method: "POST",
        body: JSON.stringify({
          source: "gpx_upload",
          externalId: "gpx_taf12min_hash",
          onDuplicate: "update",
          actualDurationSeconds: 720,
          distanceMeters: 2690,
        }),
      });

      const updateRes = await postAttempt(updateReq);
      expect(updateRes.status).toBe(200);
      expect(prisma.tafAttempt.update).toHaveBeenCalledWith({
        where: { id: "att-gpx-1" },
        data: expect.objectContaining({
          distanceMeters: 2690,
          targetDurationSeconds: 900,
          avgHeartRate: 178,
          maxHeartRate: 192,
          locationType: "pista_400m",
          shoeName: "Nike Streakfly",
          notes: "Simulado forte a partir do GPX",
        }),
      });
    });

    it("PUT /api/taf/attempts/[id] atualiza shoeName/FC e ignora source/externalId", async () => {
      vi.mocked(prisma.tafAttempt.update).mockResolvedValueOnce(existingGpxAttempt as never);

      const req = new Request("http://localhost/api/taf/attempts/att-gpx-1", {
        method: "PUT",
        body: JSON.stringify({
          shoeName: "Nike Vaporfly 3",
          avgHeartRate: 180,
          source: "manual",
          externalId: "gpx_mutated",
        }),
      });

      const res = await putAttempt(req, { params: { id: "att-gpx-1" } });
      expect(res.status).toBe(200);

      const updateCall = vi.mocked(prisma.tafAttempt.update).mock.calls[0][0];
      expect(updateCall.data).toEqual({
        shoeName: "Nike Vaporfly 3",
        avgHeartRate: 180,
        syncedToSheetsAt: null,
      });
      expect("source" in updateCall.data).toBe(false);
      expect("externalId" in updateCall.data).toBe(false);
    });
  });
});
