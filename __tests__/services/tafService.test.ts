import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  tafService,
  DEFAULT_GOAL,
  TafApiError,
} from "@/lib/services/tafService";
import {
  CreateTafAttemptSchema,
  CreateTrainingSessionSchema,
} from "@/lib/validations/taf";
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
        json: async () => ({
          success: true,
          data: newGoal,
          timestamp: new Date().toISOString(),
        }),
      });

      const saved = await tafService.saveGoal(newGoal);
      expect(saved.targetDistanceMeters).toBe(2400);
      expect(global.fetch).toHaveBeenCalledWith("/api/taf/goals", expect.objectContaining({
        method: "POST",
        body: JSON.stringify(newGoal),
      }));
    });

    it("salva e recupera meta multimodal completa via tafService", async () => {
      const multimodalGoal = {
        institutionName: "Polícia Federal",
        minDistanceMeters: 2350,
        targetDistanceMeters: 2500,
        targetDurationMinutes: 12,
        targetExamDate: "2026-11-20",
        pullupType: "dinamica" as const,
        pullupMinReps: 5,
        pullupTargetReps: 8,
        pushupMinReps: 30,
        pushupTargetReps: 40,
        absMinReps: 35,
        absTargetReps: 45,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: multimodalGoal,
          timestamp: new Date().toISOString(),
        }),
      });

      const saved = await tafService.saveGoal(multimodalGoal);
      expect(saved.institutionName).toBe("Polícia Federal");
      expect(saved.minDistanceMeters).toBe(2350);
      expect(saved.pullupMinReps).toBe(5);
      expect(saved.pushupMinReps).toBe(30);
      expect(saved.absMinReps).toBe(35);
    });

    it("lança erro concatenando detalhes de validação da API quando presentes", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: "Dados inválidos",
          details: [
            { field: "targetDistanceMeters", message: "A distância alvo deve ser de no mínimo 500 metros" },
            { field: "targetDurationMinutes", message: "A duração alvo máxima é de 60 minutos" },
          ],
        }),
      });

      await expect(
        tafService.saveGoal({ targetDistanceMeters: -10, targetDurationMinutes: 99, targetExamDate: null })
      ).rejects.toThrow("A distância alvo deve ser de no mínimo 500 metros; A duração alvo máxima é de 60 minutos");
    });

    it("lança erro com mensagem de erro direta quando details não estiver presente", async () => {
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

    it("recupera lista de tentativas via GET na API com suporte a paginação", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [attemptSample],
          meta: { limit: 10, nextCursor: "att-1", hasMore: true },
        }),
      });

      const attempts = await tafService.getAttempts({ limit: 10, cursor: "att-0" });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].id).toBe("att-1");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/taf/attempts?limit=10&cursor=att-0",
        expect.objectContaining({ cache: "no-store" })
      );
    });

    it("lança erro concatenando details de validação em tentativa inválida", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: "Dados inválidos",
          details: [
            { field: "actualDurationSeconds", message: "A duração do simulado deve ser de pelo menos 30 segundos" },
          ],
        }),
      });

      await expect(
        tafService.saveAttempt({ ...attemptSample, actualDurationSeconds: -5 }, false)
      ).rejects.toThrow("A duração do simulado deve ser de pelo menos 30 segundos");
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

    it("recupera treinos com suporte a opções de paginação e filtro por modalidade", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [trainingSample],
          meta: { limit: 5, nextCursor: null, hasMore: false },
        }),
      });

      const trainings = await tafService.getTrainings({
        limit: 5,
        activityType: "corrida_intervalada",
      });
      expect(trainings).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/taf/trainings?limit=5&activityType=corrida_intervalada",
        expect.objectContaining({ cache: "no-store" })
      );
    });

    it("lança erro concatenando details de validação em treino inválido", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: "Dados inválidos",
          details: [
            { field: "distanceKm", message: "A distância do treino deve ser de pelo menos 0,05 km (50m)" },
          ],
        }),
      });

      await expect(
        tafService.saveTraining({ ...trainingSample, distanceKm: -1 }, false)
      ).rejects.toThrow("A distância do treino deve ser de pelo menos 0,05 km (50m)");
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

  describe("Parsing de Atividade (.FIT / .GPX — parseActivity & parseGpx)", () => {
    it("envia FormData para POST /api/training-sessions/parse-activity sem definir Content-Type manual e desenvelopa resposta", async () => {
      const mockPreview = {
        source: "fit_upload",
        filesUsed: ["fit", "gpx"],
        name: "Treino Forte",
        distanceKm: 5,
        durationSeconds: 1500,
        paceFormatted: "5:00",
        alreadyExists: false,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockPreview }),
      });

      const blobFit = new Blob(["fit-bytes"], { type: "application/octet-stream" });
      const blobGpx = new Blob(["<gpx></gpx>"], { type: "application/gpx+xml" });

      const result = await tafService.parseActivity([blobFit, blobGpx]);

      expect(result).toEqual(mockPreview);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = vi.mocked(global.fetch).mock.calls[0];
      expect(calledUrl).toBe("/api/training-sessions/parse-activity");
      expect(calledInit?.method).toBe("POST");
      expect(calledInit?.body).toBeInstanceOf(FormData);
      expect(calledInit?.headers).toBeUndefined();
    });

    it("lança erro amigável quando parseGpx / parseActivity recebe status !ok (ex: 422)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          success: false,
          error: "Modalidade \"cycling\" não é suportada.",
        }),
      });

      const blob = new Blob(["bad"], { type: "application/octet-stream" });
      await expect(tafService.parseGpx(blob)).rejects.toThrow(
        'Modalidade "cycling" não é suportada.'
      );
    });
  });

  describe("Backup v3, retrocompatibilidade, 409 Conflict e CSV seguro (Fase 10)", () => {
    it("exporta backup v3 preservando origem FIT/GPX, externalId, telemetria, calorias e splits", () => {
      const attempt: TafAttempt = {
        id: "att-v3",
        source: "fit_upload",
        externalId: "fit_abc123",
        testDate: "2026-11-10T07:00:00Z",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2650,
        speedKmh: 13.25,
        paceSeconds: 272,
        paceFormatted: "4:32",
        locationType: "pista_400m",
        shoeName: "Nike Pegasus 41",
        avgHeartRate: 171,
        maxHeartRate: 186,
        laps: [
          {
            lapNumber: 1,
            distanceMeters: 400,
            durationSeconds: 108,
            paceFormatted: "4:30",
          },
        ],
        createdAt: "2026-11-10T07:15:00Z",
        updatedAt: "2026-11-10T07:15:00Z",
      };

      const training: TrainingSession = {
        id: "tr-v3",
        source: "gpx_upload",
        externalId: "gpx_def456",
        sessionDate: "2026-11-11T06:30:00Z",
        activityType: "tempo_run",
        distanceKm: 8.5,
        durationSeconds: 2380,
        elapsedSeconds: 2450,
        speedKmh: 12.86,
        paceSeconds: 280,
        paceFormatted: "4:40",
        avgHeartRate: 164,
        maxHeartRate: 178,
        avgCadence: 180,
        elevationGainM: 42,
        shoeName: "Olympikus Corre 4",
        activeCalories: 580,
        totalCalories: 640,
        splits: [
          {
            kilometer: 1,
            durationSeconds: 280,
            paceFormatted: "4:40",
            avgHeartRate: 158,
            elevationDiffM: 6,
          },
        ],
        createdAt: "2026-11-11T07:20:00Z",
        updatedAt: "2026-11-11T07:20:00Z",
      };

      const jsonStr = tafService.exportBackupJson(DEFAULT_GOAL, [attempt], [training]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.version).toBe(3);
      expect(parsed.appName).toBe("PaceLab");
      expect(parsed.attempts[0].externalId).toBe("fit_abc123");
      expect(parsed.attempts[0].laps).toHaveLength(1);
      expect(parsed.trainings[0].source).toBe("gpx_upload");
      expect(parsed.trainings[0].avgCadence).toBe(180);
      expect(parsed.trainings[0].totalCalories).toBe(640);
      expect(parsed.trainings[0].splits).toHaveLength(1);
    });

    it("importa backups legados v1/v2 normalizando campos ausentes sem perder registros", async () => {
      const saveGoalSpy = vi.spyOn(tafService, "saveGoal").mockResolvedValue(DEFAULT_GOAL);
      const saveAttemptSpy = vi
        .spyOn(tafService, "saveAttempt")
        .mockResolvedValue({} as TafAttempt);
      const saveTrainingSpy = vi
        .spyOn(tafService, "saveTraining")
        .mockResolvedValue({} as TrainingSession);

      const legacyBackup = JSON.stringify({
        version: 1,
        goal: DEFAULT_GOAL,
        attempts: [
          {
            id: "att-v1",
            testDate: "2025-05-01T08:00:00Z",
            targetDurationSeconds: 720,
            actualDurationSeconds: 720,
            distanceMeters: 2200,
          },
        ],
        trainings: [
          {
            id: "tr-v1",
            sessionDate: "2025-05-02T08:00:00Z",
            activityType: "corrida_continua",
            distanceKm: 5,
            durationSeconds: 1800,
          },
        ],
      });

      const res = await tafService.importBackupJson(legacyBackup);
      expect(res.success).toBe(true);
      expect(res.version).toBe(1);
      expect(res.attemptsCount).toBe(1);
      expect(res.trainingsCount).toBe(1);
      expect(res.skippedCount).toBe(0);
      expect(saveGoalSpy).toHaveBeenCalledTimes(1);
      expect(saveAttemptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "att-v1",
          source: "manual",
          externalId: null,
          laps: [],
        }),
        false
      );
      expect(saveTrainingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "tr-v1",
          source: "manual",
          externalId: null,
          splits: [],
        }),
        false
      );
    });

    it("tolera conflito 409 (externalId duplicado) e erros pontuais sem abortar nem inflar contagem", async () => {
      vi.spyOn(tafService, "saveGoal").mockResolvedValue(DEFAULT_GOAL);
      vi.spyOn(tafService, "saveAttempt")
        .mockRejectedValueOnce(new TafApiError("Esta atividade já foi importada", 409))
        .mockResolvedValueOnce({} as TafAttempt);
      vi.spyOn(tafService, "saveTraining")
        .mockRejectedValueOnce(new Error("Erro 500 transitório"))
        .mockResolvedValueOnce({} as TrainingSession);

      const v3Backup = JSON.stringify({
        version: 3,
        appName: "PaceLab",
        attempts: [
          {
            id: "att-dup",
            source: "fit_upload",
            externalId: "fit_dup_1",
            distanceMeters: 2500,
            actualDurationSeconds: 720,
          },
          {
            id: "att-ok",
            source: "manual",
            distanceMeters: 2450,
            actualDurationSeconds: 720,
          },
        ],
        trainings: [
          {
            id: "tr-fail",
            source: "gpx_upload",
            externalId: "gpx_1",
            distanceKm: 4,
            durationSeconds: 1200,
          },
          {
            id: "tr-ok",
            source: "gpx_upload",
            externalId: "gpx_2",
            distanceKm: 6,
            durationSeconds: 1800,
          },
        ],
      });

      const res = await tafService.importBackupJson(v3Backup);
      expect(res.success).toBe(true);
      expect(res.attemptsCount).toBe(1);
      expect(res.trainingsCount).toBe(1);
      expect(res.skippedCount).toBe(1);
      expect(res.failedCount).toBe(1);
    });

    it("rejeita JSON array ou objeto sem estrutura PaceLab", async () => {
      const arrayRes = await tafService.importBackupJson("[1, 2, 3]");
      expect(arrayRes.success).toBe(false);

      const emptyObjRes = await tafService.importBackupJson('{"foo":"bar"}');
      expect(emptyObjRes.success).toBe(false);
    });

    it("exporta CSV com novas colunas após colunas legadas e neutraliza CSV Formula Injection", () => {
      const attempts: TafAttempt[] = [
        {
          id: "att-sec",
          source: "fit_upload",
          externalId: "=IMPORTXML(\"http://evil\")",
          testDate: "2026-11-10T07:00:00Z",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2600,
          speedKmh: 13.0,
          paceSeconds: 277,
          paceFormatted: "4:37",
          locationType: "pista_400m",
          shoeName: "+cmd|'/C calc'!A0",
          avgHeartRate: 170,
          maxHeartRate: 184,
          notes: "@SUM(1+1)*cmd\nsegunda linha",
          laps: [{ lapNumber: 1, distanceMeters: 400, durationSeconds: 110 }],
          createdAt: "2026-11-10T07:15:00Z",
          updatedAt: "2026-11-10T07:15:00Z",
        },
      ];

      const trainings: TrainingSession[] = [
        {
          id: "tr-sec",
          source: "gpx_upload",
          externalId: "gpx_safe_1",
          sessionDate: "2026-11-11T06:00:00Z",
          activityType: "corrida_continua",
          distanceKm: 10,
          durationSeconds: 3000,
          elapsedSeconds: 3120,
          speedKmh: 12.0,
          paceSeconds: 300,
          paceFormatted: "5:00",
          avgHeartRate: 162,
          maxHeartRate: 175,
          avgCadence: 178,
          elevationGainM: 85,
          shoeName: "-1+1",
          perceivedEffort: 7,
          bodyWeightKg: 74,
          notes: "=HYPERLINK(\"http://evil\",\"clique\")",
          activeCalories: 610,
          totalCalories: 700,
          createdAt: "2026-11-11T07:00:00Z",
          updatedAt: "2026-11-11T07:00:00Z",
        },
      ];

      const csvAttempts = tafService.exportAttemptsCsv(attempts);
      const [attHeader, attRow] = csvAttempts.split("\n");
      expect(attHeader).toBe(
        "ID,Data,Duracao_Segundos,Distancia_Metros,Pace_Formatado,Velocidade_Kmh,Local,Notas,Origem,ID_Externo,Tenis,FC_Media_Bpm,FC_Max_Bpm,Voltas_400m"
      );
      expect(attRow).toContain(`"'@SUM(1+1)*cmd segunda linha"`);
      expect(attRow).toContain(`"'=IMPORTXML(""http://evil"")"`);
      expect(attRow).toContain(`"'+cmd|'/C calc'!A0"`);
      expect(attRow).toContain(",fit_upload,");
      expect(attRow).toContain(",170,184,1");

      const csvTrainings = tafService.exportTrainingsCsv(trainings);
      const [trHeader, trRow] = csvTrainings.split("\n");
      expect(trHeader).toBe(
        "ID,Data,Modalidade,Distancia_Km,Duracao_Segundos,Pace_Formatado,Velocidade_Kmh,RPE_Esforco,Peso_Kg,Notas,Origem,ID_Externo,Tempo_Decorrido_Segundos,FC_Media_Bpm,FC_Max_Bpm,Cadencia_Media_Spm,Ganho_Elevacao_M,Tenis,Calorias_Ativas,Calorias_Totais"
      );
      expect(trRow).toContain(`"'=HYPERLINK(""http://evil"",""clique"")"`);
      expect(trRow).toContain(`"'-1+1"`);
      expect(trRow).toContain(",gpx_upload,\"gpx_safe_1\",3120,162,175,178,85,");
      expect(trRow).toContain(",610,700");

      // Verifica proteção adicional contra espaços iniciais antes de fórmula
      const csvSpaceFormula = tafService.exportTrainingsCsv([
        {
          ...trainings[0],
          shoeName: "  =CMD()",
          notes: "\t@SUM(A1:A2)",
        },
      ]);
      expect(csvSpaceFormula).toContain(`"'  =CMD()"`);
      expect(csvSpaceFormula).toContain(`"'\t@SUM(A1:A2)"`);
    });

    it("normaliza backups v1/v3 sujos para passarem 100% pelos schemas Zod reais das rotas POST", async () => {
      vi.spyOn(tafService, "saveGoal").mockResolvedValue(DEFAULT_GOAL);

      const attemptSpy = vi
        .spyOn(tafService, "saveAttempt")
        .mockImplementation(async (payload) => {
          const parsed = CreateTafAttemptSchema.parse(payload);
          return { ...payload, ...parsed } as unknown as TafAttempt;
        });

      const trainingSpy = vi
        .spyOn(tafService, "saveTraining")
        .mockImplementation(async (payload) => {
          const parsed = CreateTrainingSessionSchema.parse(payload);
          return { ...payload, ...parsed } as unknown as TrainingSession;
        });

      const dirtyLegacyJson = JSON.stringify({
        version: 1,
        attempts: [
          {
            id: "att-dirty-v1",
            testDate: "data-corrompida",
            distanceMeters: 2450.4,
            actualDurationSeconds: 720.2,
            locationType: "",
            avgHeartRate: 0,
            maxHeartRate: 0,
          },
        ],
        trainings: [
          {
            id: "tr-dirty-v1",
            sessionDate: "",
            activityType: "modalidade_extinta",
            distanceKm: 6.25,
            durationSeconds: 1800,
            elapsedSeconds: 1200, // menor que durationSeconds -> sanitizado
            avgHeartRate: 168,
            maxHeartRate: 150, // menor que avgHeartRate -> corrigido
            avgCadence: 0, // zero legado -> null
            activeCalories: 0, // zero -> null
            totalCalories: null,
          },
        ],
      });

      const res = await tafService.importBackupJson(dirtyLegacyJson);
      expect(res.success).toBe(true);
      expect(res.attemptsCount).toBe(1);
      expect(res.trainingsCount).toBe(1);
      expect(res.failedCount).toBe(0);
      expect(attemptSpy).toHaveBeenCalledTimes(1);
      expect(trainingSpy).toHaveBeenCalledTimes(1);
    });
  });
});
