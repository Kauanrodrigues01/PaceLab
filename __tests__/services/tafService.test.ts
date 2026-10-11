import { describe, it, expect, beforeEach, vi } from "vitest";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { TafAttempt, TrainingSession } from "@/types";

describe("tafService (Offline-First com Fallback e Prisma)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("retorna meta padrão quando não há nada salvo e API está offline", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const goal = await tafService.getGoal();
    expect(goal.targetDistanceMeters).toBe(DEFAULT_GOAL.targetDistanceMeters);
    expect(goal.targetDurationMinutes).toBe(12);
  });

  it("salva e recupera meta no fallback local se API falhar", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));

    const newGoal = {
      targetDistanceMeters: 2400,
      targetDurationMinutes: 12,
      targetExamDate: "2026-12-01",
    };

    const saved = await tafService.saveGoal(newGoal);
    expect(saved.targetDistanceMeters).toBe(2400);

    const retrieved = await tafService.getGoal();
    expect(retrieved.targetDistanceMeters).toBe(2400);
  });

  it("salva, lista, atualiza e exclui tentativas de TAF com fallback local", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));

    const attempt1: TafAttempt = {
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

    await tafService.saveAttempt(attempt1);
    let attempts = await tafService.getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].distanceMeters).toBe(2250);

    // Atualização
    const updatedAttempt = { ...attempt1, distanceMeters: 2310 };
    await tafService.saveAttempt(updatedAttempt);
    attempts = await tafService.getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].distanceMeters).toBe(2310);

    // Exclusão
    await tafService.deleteAttempt("att-1");
    attempts = await tafService.getAttempts();
    expect(attempts).toHaveLength(0);
  });

  it("salva, lista e exclui treinos no diário", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));

    const training: TrainingSession = {
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

    await tafService.saveTraining(training);
    let trainings = await tafService.getTrainings();
    expect(trainings).toHaveLength(1);
    expect(trainings[0].activityType).toBe("corrida_continua");
    expect(trainings[0].perceivedEffort).toBe(7);

    await tafService.deleteTraining("tr-1");
    trainings = await tafService.getTrainings();
    expect(trainings).toHaveLength(0);
  });

  it("exporta e importa backup completo em JSON", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));

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

    await tafService.saveAttempt(attempt);

    const backupJson = tafService.exportBackupJson();
    expect(backupJson).toContain("att-backup");
    expect(backupJson).toContain("PaceLab");

    // Limpa storage
    localStorage.clear();
    expect(await tafService.getAttempts()).toHaveLength(0);

    // Restaura
    const importResult = await tafService.importBackupJson(backupJson);
    expect(importResult.success).toBe(true);
    expect(importResult.attemptsCount).toBe(1);

    const restoredAttempts = await tafService.getAttempts();
    expect(restoredAttempts).toHaveLength(1);
    expect(restoredAttempts[0].id).toBe("att-backup");
  });

  it("gera CSV válido de tentativas e treinos", () => {
    const attempts: TafAttempt[] = [
      {
        id: "att-csv",
        testDate: "2026-10-10",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2400,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        locationType: "Pista",
        notes: "Teste forte",
        createdAt: "2026-10-10",
        updatedAt: "2026-10-10",
      },
    ];

    const csvAttempts = tafService.exportAttemptsCsv(attempts);
    expect(csvAttempts).toContain("ID,Data,Duracao_Segundos");
    expect(csvAttempts).toContain("att-csv,2026-10-10,720,2400");

    const trainings: TrainingSession[] = [
      {
        id: "tr-csv",
        sessionDate: "2026-10-08",
        activityType: "corrida_intervalada",
        distanceKm: 4.5,
        durationSeconds: 1500,
        speedKmh: 10.8,
        paceSeconds: 333,
        paceFormatted: "5:33",
        perceivedEffort: 8,
        bodyWeightKg: 74.0,
        notes: "Tiros de 400m",
        createdAt: "2026-10-08",
        updatedAt: "2026-10-08",
      },
    ];

    const csvTrainings = tafService.exportTrainingsCsv(trainings);
    expect(csvTrainings).toContain("Modalidade,Distancia_Km");
    expect(csvTrainings).toContain("corrida_intervalada,4.50");
  });

  it("verifica saúde do banco via rota de health", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "connected", database: "PostgreSQL" }),
    });

    const health = await tafService.checkDatabaseHealth();
    expect(health.connected).toBe(true);
    expect(health.orm).toBe("Prisma");

    // Cenário de erro na health check
    global.fetch = vi.fn().mockRejectedValue(new Error("Conexão recusada"));
    const healthError = await tafService.checkDatabaseHealth();
    expect(healthError.connected).toBe(false);
    expect(healthError.error).toBe("Conexão recusada");
  });

  it("consome API com sucesso quando online para metas, tentativas e treinos", async () => {
    // 1. getGoal online
    const apiGoal = { targetDistanceMeters: 2500, targetDurationMinutes: 12, targetExamDate: null };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => apiGoal,
    });
    const g = await tafService.getGoal();
    expect(g.targetDistanceMeters).toBe(2500);

    // 2. saveGoal online
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...apiGoal, targetDistanceMeters: 2600 }),
    });
    const savedG = await tafService.saveGoal({ ...apiGoal, targetDistanceMeters: 2600 });
    expect(savedG.targetDistanceMeters).toBe(2600);

    // 3. getAttempts online
    const attSample: TafAttempt = {
      id: "online-1",
      testDate: "2026-10-10",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2450,
      speedKmh: 12.25,
      paceSeconds: 293,
      paceFormatted: "4:53",
      createdAt: "2026-10-10",
      updatedAt: "2026-10-10",
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [attSample],
    });
    const atts = await tafService.getAttempts();
    expect(atts).toHaveLength(1);
    expect(atts[0].id).toBe("online-1");

    // 4. saveAttempt online (create)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...attSample, id: "online-created" }),
    });
    const createdAtt = await tafService.saveAttempt({ ...attSample, id: "online-created" });
    expect(createdAtt.id).toBe("online-created");

    // 5. saveAttempt online (update)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...attSample, id: "online-created", distanceMeters: 2500 }),
    });
    const updatedAtt = await tafService.saveAttempt({ ...attSample, id: "online-created", distanceMeters: 2500 });
    expect(updatedAtt.distanceMeters).toBe(2500);

    // 6. deleteAttempt online
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });
    const delAtt = await tafService.deleteAttempt("online-created");
    expect(delAtt).toBe(true);

    // 7. getTrainings online
    const trSample: TrainingSession = {
      id: "tr-online",
      sessionDate: "2026-10-10",
      activityType: "corrida_continua",
      distanceKm: 8,
      durationSeconds: 2880,
      speedKmh: 10,
      paceSeconds: 360,
      paceFormatted: "6:00",
      createdAt: "2026-10-10",
      updatedAt: "2026-10-10",
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [trSample],
    });
    const trs = await tafService.getTrainings();
    expect(trs).toHaveLength(1);

    // 8. saveTraining online (create)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => trSample,
    });
    const savedTr = await tafService.saveTraining(trSample);
    expect(savedTr.distanceKm).toBe(8);

    // 9. saveTraining online (update)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...trSample, distanceKm: 9 }),
    });
    const updatedTr = await tafService.saveTraining({ ...trSample, distanceKm: 9 });
    expect(updatedTr.distanceKm).toBe(9);

    // 10. deleteTraining online
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });
    const delTr = await tafService.deleteTraining("tr-online");
    expect(delTr).toBe(true);
  });

  it("executa migrateFromLocalStorage com sucesso e com erro", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, migratedAttempts: 2, migratedTrainings: 1, goalUpdated: true }),
    });

    const result = await tafService.migrateFromLocalStorage();
    expect(result.success).toBe(true);
    expect(result.migratedAttempts).toBe(2);

    // Erro de API
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro de autenticação no banco" }),
    });
    const errResult = await tafService.migrateFromLocalStorage();
    expect(errResult.success).toBe(false);
    expect(errResult.error).toContain("Erro de autenticação");
  });

  it("trata erro ao importar backup inválido", async () => {
    const res = await tafService.importBackupJson("texto invalido nao json");
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();

    const res2 = await tafService.importBackupJson("123");
    expect(res2.success).toBe(false);
  });
});

