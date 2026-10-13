import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getProfile, PUT as putProfile } from "@/app/api/profile/route";
import { GET as getWeights, POST as postWeight } from "@/app/api/profile/weight/route";
import { DELETE as deleteWeight } from "@/app/api/profile/weight/[id]/route";
import { POST as postTraining } from "@/app/api/taf/trainings/route";
import { prisma } from "@/lib/prisma";

// Mock do prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    weightRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    trainingSession: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("API Routes de Perfil e Histórico de Pesagem (Fase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Perfil: GET /api/profile ──────────────────────────────────────────────
  describe("GET /api/profile", () => {
    it("retorna perfil existente com sucesso", async () => {
      const mockProfile = {
        id: "prof_123",
        userId: null,
        name: "Atleta Corredor",
        heightCm: 178,
        currentWeightKg: 72.5,
        birthDate: new Date("1995-05-20"),
        gender: "masculino",
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { weightRecords: 5 },
      };

      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce(mockProfile as never);

      const res = await getProfile();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Atleta Corredor");
      expect(body.data.heightCm).toBe(178);
      expect(body.data.currentWeightKg).toBe(72.5);
    });

    it("cria perfil padrão se nenhum perfil existir ainda", async () => {
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce(null);
      const defaultProfile = {
        id: "prof_new",
        userId: null,
        name: null,
        heightCm: null,
        currentWeightKg: null,
        birthDate: null,
        gender: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { weightRecords: 0 },
      };
      vi.mocked(prisma.userProfile.create).mockResolvedValueOnce(defaultProfile as never);

      const res = await getProfile();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(prisma.userProfile.create).toHaveBeenCalled();
    });
  });

  // ─── Perfil: PUT /api/profile ──────────────────────────────────────────────
  describe("PUT /api/profile", () => {
    it("atualiza perfil existente e cria registro de peso quando o peso é alterado", async () => {
      const existing = {
        id: "prof_123",
        name: "Antigo Nome",
        heightCm: 175,
        currentWeightKg: 70,
        birthDate: null,
        gender: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = {
        ...existing,
        name: "Kauan Rodrigues",
        heightCm: 180,
        currentWeightKg: 74,
      };

      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce(existing as never);
      vi.mocked(prisma.userProfile.update).mockResolvedValueOnce(updated as never);
      vi.mocked(prisma.weightRecord.create).mockResolvedValueOnce({
        id: "w_1",
        profileId: "prof_123",
        weightKg: 74,
        recordedAt: new Date(),
        notes: "Atualizado via perfil do atleta",
        source: "profile_update",
        createdAt: new Date(),
      } as never);

      const req = new Request("http://localhost:3000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Kauan Rodrigues",
          heightCm: 180,
          currentWeightKg: 74,
        }),
      });

      const res = await putProfile(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Kauan Rodrigues");
      expect(prisma.weightRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: "prof_123",
            weightKg: 74,
            source: "profile_update",
          }),
        })
      );
    });

    it("retorna erro 400 se o peso for inválido (< 30 kg ou > 250 kg)", async () => {
      const req = new Request("http://localhost:3000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentWeightKg: 20, // inválido
        }),
      });

      const res = await putProfile(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain("30 kg");
    });
  });

  // ─── Pesagens: GET /api/profile/weight ─────────────────────────────────────
  describe("GET /api/profile/weight", () => {
    it("retorna lista de pesagens do usuário", async () => {
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce({
        id: "prof_123",
      } as never);
      vi.mocked(prisma.weightRecord.findMany).mockResolvedValueOnce([
        {
          id: "w_2",
          profileId: "prof_123",
          weightKg: 71.8,
          recordedAt: new Date("2026-10-12"),
          notes: "Segunda-feira",
          source: "weekly_prompt",
          createdAt: new Date(),
        },
        {
          id: "w_1",
          profileId: "prof_123",
          weightKg: 72.5,
          recordedAt: new Date("2026-10-05"),
          notes: "Início",
          source: "manual",
          createdAt: new Date(),
        },
      ] as never);

      const res = await getWeights();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].weightKg).toBe(71.8);
    });

    it("retorna array vazio quando ainda não existe perfil", async () => {
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce(null);

      const res = await getWeights();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  // ─── Pesagens: POST /api/profile/weight ────────────────────────────────────
  describe("POST /api/profile/weight", () => {
    it("registra uma nova pesagem com sucesso e atualiza peso atual do perfil", async () => {
      vi.mocked(prisma.userProfile.findFirst).mockResolvedValueOnce({
        id: "prof_123",
        currentWeightKg: 73,
      } as never);

      const newRecord = {
        id: "w_new",
        profileId: "prof_123",
        weightKg: 71.5,
        recordedAt: new Date("2026-10-12"),
        notes: "Pesagem semanal",
        source: "weekly_prompt",
        createdAt: new Date(),
      };

      vi.mocked(prisma.weightRecord.create).mockResolvedValueOnce(newRecord as never);
      vi.mocked(prisma.weightRecord.findFirst).mockResolvedValueOnce(newRecord as never);
      vi.mocked(prisma.userProfile.update).mockResolvedValueOnce({
        id: "prof_123",
        currentWeightKg: 71.5,
      } as never);

      const req = new Request("http://localhost:3000/api/profile/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: 71.5,
          notes: "Pesagem semanal",
          source: "weekly_prompt",
        }),
      });

      const res = await postWeight(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.weightKg).toBe(71.5);
      expect(prisma.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prof_123" },
          data: { currentWeightKg: 71.5 },
        })
      );
    });

    it("retorna erro 400 se o peso for menor que 30kg", async () => {
      const req = new Request("http://localhost:3000/api/profile/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: 15,
        }),
      });

      const res = await postWeight(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain("30 kg");
    });
  });

  // ─── Pesagens: DELETE /api/profile/weight/[id] ─────────────────────────────
  describe("DELETE /api/profile/weight/[id]", () => {
    it("exclui registro e recalcula peso com a última pesagem restante", async () => {
      vi.mocked(prisma.weightRecord.findUnique).mockResolvedValueOnce({
        id: "w_to_delete",
        profileId: "prof_123",
        weightKg: 70,
      } as never);
      vi.mocked(prisma.weightRecord.delete).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValueOnce({
        id: "prof_123",
      } as never);
      vi.mocked(prisma.weightRecord.findFirst).mockResolvedValueOnce({
        id: "w_previous",
        profileId: "prof_123",
        weightKg: 71,
      } as never);
      vi.mocked(prisma.userProfile.update).mockResolvedValueOnce({
        id: "prof_123",
        currentWeightKg: 71,
      } as never);

      const res = await deleteWeight(new Request("http://localhost:3000/api/profile/weight/w_to_delete"), {
        params: { id: "w_to_delete" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(prisma.weightRecord.delete).toHaveBeenCalledWith({
        where: { id: "w_to_delete" },
      });
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { id: "prof_123" },
        data: { currentWeightKg: 71 },
      });
    });
  });

  // ─── Treinos com Calorias: POST /api/taf/trainings ─────────────────────────
  describe("POST /api/taf/trainings com Calorias", () => {
    it("persiste campos de calorias ativas, totais e MET", async () => {
      const mockSavedTraining = {
        id: "trn_cal_1",
        sessionDate: new Date(),
        activityType: "corrida_continua",
        distanceKm: 5.0,
        durationSeconds: 1800,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        activeCalories: 337,
        totalCalories: 374,
        metValue: 9.8,
        calorieMethod: "compendium_2024_met",
        calorieSource: "auto_calculated",
        calorieMetadata: { compendiumCode: "12050" },
      };

      vi.mocked(prisma.trainingSession.create).mockResolvedValueOnce(mockSavedTraining as never);

      const req = new Request("http://localhost:3000/api/taf/trainings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "corrida_continua",
          distanceKm: 5.0,
          durationSeconds: 1800,
          bodyWeightKg: 70,
          activeCalories: 337,
          totalCalories: 374,
          metValue: 9.8,
          calorieMethod: "compendium_2024_met",
          calorieSource: "auto_calculated",
          calorieMetadata: { compendiumCode: "12050" },
        }),
      });

      const res = await postTraining(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.activeCalories).toBe(337);
      expect(body.data.metValue).toBe(9.8);
      expect(prisma.trainingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activeCalories: 337,
            totalCalories: 374,
            metValue: 9.8,
            calorieMethod: "compendium_2024_met",
          }),
        })
      );
    });
  });
});
