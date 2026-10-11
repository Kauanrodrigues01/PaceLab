import { describe, it, expect, beforeEach, vi } from "vitest";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { TafAttempt, TrainingSession } from "@/types";

describe("tafService (Persistência Direta no Supabase via Prisma API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Metas do TAF", () => {
    it("retorna meta padrão quando a API falha ou não há conexão", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

      const goal = await tafService.getGoal();
      expect(goal.targetDistanceMeters).toBe(DEFAULT_GOAL.targetDistanceMeters);
      expect(goal.targetDurationMinutes).toBe(12);
    });

    it("retorna a meta retornada pela API quando bem-sucedida", async () => {
      const mockGoal = {
        targetDistanceMeters: 2500,
        targetDurationMinutes: 12,
        targetExamDate: "2026-12-10",
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockGoal,
      });

      const goal = await tafService.getGoal();
      expect(goal.targetDistanceMeters).toBe(2500);
      expect(goal.targetExamDate).toBe("2026-12-10");
    });

    it("salva a meta via POST na API com sucesso", async () => {
      const newGoal = {
        targetDistanceMeters: 2400,
        targetDurationMinutes: 12,
        targetExamDate: "2026-12-01",
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => newGoal,
      });

      const saved = await tafService.saveGoal(newGoal);
      expect(saved.targetDistanceMeters).toBe(2400);
      expect(global.fetch).toHaveBeenCalledWith("/api/taf/goals", expect.objectContaining({
        method: "POST",
        body: JSON.stringify(newGoal),
      }));
    });

    it("lança erro ao salvar meta se a API retornar erro HTTP", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Distância inválida" }),
      });

      await expect(
        tafService.saveGoal({ targetDistanceMeters: -10, targetDurationMinutes: 12, targetExamDate: null })
      ).rejects.toThrow("Distância inválida");
    });
  });

  describe("Simulados de TAF (12 min)", () => {
    const attemptSample: TafAttempt = {
      id: "att-1",
      testDate: "2026-10-10T10:00:00Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2250,
      speedKmh: 11.25,
      paceSeconds: 320,
      paceFormatted: "5:20",
      createdAt: "2026-10-10T10:00:00Z",
      updatedAt: "2026-10-10T10:00:00Z",
    };

    it("recupera lista de tentativas via GET na API", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [attemptSample],
      });

      const attempts = await tafService.getAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].id).toBe("att-1");
      expect(attempts[0].distanceMeters).toBe(2250);
    });

    it("lança erro se a consulta de tentativas falhar", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Erro interno no banco de dados" }),
      });

      await expect(tafService.getAttempts()).rejects.toThrow("Erro interno no banco de dados");
    });

    it("cria nova tentativa via POST na API", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => attemptSample,
      });

      const saved = await tafService.saveAttempt(attemptSample, false);
      expect(saved.id).toBe("att-1");
      expect(global.fetch).toHaveBeenCalledWith("/api/taf/attempts", expect.objectContaining({
        method: "POST",
      }));
    });

    it("atualiza tentativa existente via PUT na API", async () => {
      const updated = { ...attemptSample, distanceMeters: 2350 };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => updated,
      });

      const saved = await tafService.saveAttempt(updated, true);
      expect(saved.distanceMeters).toBe(2350);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/taf/attempts/${encodeURIComponent(updated.id)}`,
        expect.objectContaining({
          method: "PUT",
        })
      );
    });

    it("lança erro ao salvar tentativa se a API retornar erro HTTP", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Erro ao salvar tentativa" }),
      });

      await expect(tafService.saveAttempt(attemptSample, false)).rejects.toThrow(
        "Erro ao salvar tentativa"
      );
    });

    it("lança erro ao excluir tentativa se a API retornar erro HTTP", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Simulado não encontrado para exclusão" }),
      });

      await expect(tafService.deleteAttempt("att-inexistente")).rejects.toThrow(
        "Simulado não encontrado para exclusão"
      );
    });
  });

  describe("Diário de Treinos", () => {
    const trainingSample: TrainingSession = {
      id: "tr-1",
      sessionDate: "2026-10-09T07:00:00Z",
      activityType: "corrida_continua",
      distanceKm: 5.0,
      durationSeconds: 1800,
      speedKmh: 10.0,
      paceSeconds: 360,
      paceFormatted: "6:00",
      perceivedEffort: 7,
      bodyWeightKg: 75.5,
      createdAt: "2026-10-09T07:00:00Z",
      updatedAt: "2026-10-09T07:00:00Z",
    };

    it("recupera treinos via GET na API", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [trainingSample],
      });

      const trainings = await tafService.getTrainings();
      expect(trainings).toHaveLength(1);
      expect(trainings[0].activityType).toBe("corrida_continua");
    });

    it("cria treino via POST na API", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => trainingSample,
      });

      const saved = await tafService.saveTraining(trainingSample, false);
      expect(saved.id).toBe("tr-1");
      expect(global.fetch).toHaveBeenCalledWith("/api/taf/trainings", expect.objectContaining({
        method: "POST",
      }));
    });

    it("atualiza treino via PUT na API", async () => {
      const updated = { ...trainingSample, distanceKm: 6.0 };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => updated,
      });

      const saved = await tafService.saveTraining(updated, true);
      expect(saved.distanceKm).toBe(6.0);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/taf/trainings/${encodeURIComponent(updated.id)}`,
        expect.objectContaining({ method: "PUT" })
      );
    });

    it("lança erro se a consulta de treinos falhar", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Erro ao consultar diário de treinos" }),
      });

      await expect(tafService.getTrainings()).rejects.toThrow(
        "Erro ao consultar diário de treinos"
      );
    });

    it("lança erro ao salvar treino se a API retornar erro HTTP", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Distância de treino inválida" }),
      });

      await expect(tafService.saveTraining(trainingSample, false)).rejects.toThrow(
        "Distância de treino inválida"
      );
    });

    it("lança erro ao excluir treino se a API retornar erro HTTP", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Treino não encontrado para exclusão" }),
      });

      await expect(tafService.deleteTraining("tr-inexistente")).rejects.toThrow(
        "Treino não encontrado para exclusão"
      );
    });
  });

  describe("Saúde do Banco (Health Check)", () => {
    it("verifica saúde do banco com sucesso", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "connected", database: "PostgreSQL", latencyMs: 15 }),
      });

      const health = await tafService.checkDatabaseHealth();
      expect(health.connected).toBe(true);
      expect(health.orm).toBe("Prisma");
      expect(health.database).toBe("PostgreSQL");
      expect(health.latencyMs).toBe(15);
    });

    it("trata erro na verificação de saúde do banco", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Conexão recusada"));

      const health = await tafService.checkDatabaseHealth();
      expect(health.connected).toBe(false);
      expect(health.error).toBe("Conexão recusada");
    });
  });

  describe("Backup JSON e Exportação CSV", () => {
    const attempt: TafAttempt = {
      id: "att-backup",
      testDate: "2026-10-01T08:00:00Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2350,
      speedKmh: 11.75,
      paceSeconds: 306,
      paceFormatted: "5:06",
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-01T08:00:00Z",
    };

    const training: TrainingSession = {
      id: "tr-backup",
      sessionDate: "2026-10-02T08:00:00Z",
      activityType: "corrida_continua",
      distanceKm: 5,
      durationSeconds: 1800,
      speedKmh: 10,
      paceSeconds: 360,
      paceFormatted: "6:00",
      createdAt: "2026-10-02T08:00:00Z",
      updatedAt: "2026-10-02T08:00:00Z",
    };

    it("exporta backup JSON formatado com os dados fornecidos", () => {
      const backupJson = tafService.exportBackupJson(
        DEFAULT_GOAL,
        [attempt],
        [training]
      );
      expect(backupJson).toContain("att-backup");
      expect(backupJson).toContain("tr-backup");
      expect(backupJson).toContain("PaceLab");
    });

    it("importa backup JSON e persiste os itens na API", async () => {
      const backupJson = tafService.exportBackupJson(
        DEFAULT_GOAL,
        [attempt],
        [training]
      );

      // Simula respostas de sucesso para as chamadas da API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const importResult = await tafService.importBackupJson(backupJson);
      expect(importResult.success).toBe(true);
      expect(importResult.attemptsCount).toBe(1);
      expect(importResult.trainingsCount).toBe(1);
    });

    it("trata erro ao importar JSON inválido ou corrompido", async () => {
      const res = await tafService.importBackupJson("texto_invalido_nao_json");
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();

      const res2 = await tafService.importBackupJson("123");
      expect(res2.success).toBe(false);
    });

    it("gera CSV válido de tentativas e treinos", () => {
      const csvAttempts = tafService.exportAttemptsCsv([attempt]);
      expect(csvAttempts).toContain("ID,Data,Duracao_Segundos");
      expect(csvAttempts).toContain("att-backup,2026-10-01T08:00:00Z,720,2350");

      const csvTrainings = tafService.exportTrainingsCsv([training]);
      expect(csvTrainings).toContain("Modalidade,Distancia_Km");
      expect(csvTrainings).toContain("corrida_continua,5.00");
    });
  });
});
