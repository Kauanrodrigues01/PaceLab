import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockPrisma,
  mockSafeReconcileWeeklyPlans,
  mockIsGoogleSheetsConfigured,
  mockPushWeeklyPlanStatusToSheets,
} = vi.hoisted(() => ({
  mockPrisma: {
    weeklyPlanItem: {
      findMany: vi.fn(),
    },
    trainingSession: {
      findMany: vi.fn(),
    },
  },
  mockSafeReconcileWeeklyPlans: vi.fn(),
  mockIsGoogleSheetsConfigured: vi.fn(),
  mockPushWeeklyPlanStatusToSheets: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/api/sheetsSync", () => ({
  safeReconcileWeeklyPlans: mockSafeReconcileWeeklyPlans,
}));

vi.mock("@/lib/env", () => ({
  isGoogleSheetsConfigured: mockIsGoogleSheetsConfigured,
}));

vi.mock("@/lib/googleSheets", () => ({
  pushWeeklyPlanStatusToSheets: mockPushWeeklyPlanStatusToSheets,
  safeAutoSync: async (fn: () => Promise<unknown>) => {
    const data = await fn();
    return { skipped: false, ok: true, data };
  },
}));

import { GET } from "@/app/api/weekly-plan/route";

describe("API /api/weekly-plan (GET)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Quarta-feira, 14 de outubro de 2026 às 12:00 UTC (09:00 America/Fortaleza)
    vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValue([]);
    mockPrisma.trainingSession.findMany.mockResolvedValue([]);
    mockSafeReconcileWeeklyPlans.mockResolvedValue({ matched: 0, missed: 0, updatedCount: 0 });
    mockIsGoogleSheetsConfigured.mockReturnValue(false);
    mockPushWeeklyPlanStatusToSheets.mockResolvedValue({ pushed: 0, sheetMissingOrEmpty: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna semana atual em America/Fortaleza vazia com adherencePercent null (sem NaN)", async () => {
    const res = await GET(new Request("http://localhost/api/weekly-plan"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      weekLabel: "12/10 – 18/10",
      isCurrentWeek: true,
      isSundayRolloverWindow: false,
      hasNextPlannedWeek: false,
      items: [],
      summary: {
        totalPlanned: 0,
        completed: 0,
        adapted: 0,
        partial: 0,
        planned: 0,
        missed: 0,
        adherencePercent: null,
      },
      rollingFourWeeksAverage: {
        averagePercent: null,
        weeksCount: 0,
        weeks: [],
      },
      extraSessions: [],
      extraSummary: {
        count: 0,
        totalDistanceKm: 0,
      },
    });
    expect(Number.isNaN(json.data.summary.adherencePercent)).toBe(false);
  });

  it("retorna erro 400 quando weekStart não é YYYY-MM-DD ou representa data inválida", async () => {
    const resInvalidFormat = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=12-10-2026")
    );
    expect(resInvalidFormat.status).toBe(400);

    const resInvalidCalendar = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=2026-02-30")
    );
    expect(resInvalidCalendar.status).toBe(400);
  });

  it("consolida itens da semana, payloads completos de matchedSession, extraSessions em Fortaleza (01:30Z), média móvel de 4 semanas sem lacunas e hasNextPlannedWeek", async () => {
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValue([
      // Semana -4 com plano (2026-09-14) - 100%
      {
        id: "plan-w4",
        planExternalId: "p-w4",
        plannedDate: new Date("2026-09-14T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "Rodagem Leve",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:50",
        description: "Rodagem",
        status: "Concluído",
        matchedSessionId: "sess-w4",
        matchedSession: null,
      },
      // Semana -3 (2026-09-21) propositalmente sem plano para testar omissão de semana vazia na média móvel
      // Semana -2 com plano (2026-09-28) - 50% (Parcial)
      {
        id: "plan-w2",
        planExternalId: "p-w2",
        plannedDate: new Date("2026-09-28T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "Corrida Contínua",
        targetDistanceKm: 10,
        targetPaceFormatted: "5:10",
        description: null,
        status: "Parcial",
        matchedSessionId: "sess-w2",
        matchedSession: null,
      },
      // Semana -1 com plano (2026-10-05) - 0% (Perdido)
      // Além disso, item de domingo 2026-10-11 vinculado a sess-prev-boundary feita em 2026-10-12 (D+1)
      {
        id: "plan-w1-sun",
        planExternalId: "p-w1-sun",
        plannedDate: new Date("2026-10-11T12:00:00.000Z"),
        dayOfWeek: "Domingo",
        activityType: "Longão",
        targetDistanceKm: 14,
        targetPaceFormatted: "5:45",
        description: "Longão de domingo",
        status: "Concluído",
        matchedSessionId: "sess-prev-boundary",
        matchedSession: null,
      },
      // Semana consultada (2026-10-05? Vamos consultar weekStart=2026-10-12 abaixo!)
      {
        id: "plan-cur-1",
        planExternalId: "p-cur-1",
        plannedDate: new Date("2026-10-12T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "Intervalado",
        targetDistanceKm: 8,
        targetPaceFormatted: "4:30",
        description: "6x800m",
        status: "Concluído",
        matchedSessionId: "sess-cur-1",
        matchedSession: {
          id: "sess-cur-1",
          userId: null,
          source: "fit_upload",
          externalId: "fit-cur-1",
          syncedToSheetsAt: new Date("2026-10-12T13:00:00.000Z"),
          sessionDate: new Date("2026-10-12T09:00:00.000Z"),
          activityType: "corrida_intervalada",
          distanceKm: 8.2,
          durationSeconds: 2220,
          elapsedSeconds: 2300,
          speedKmh: 13.3,
          paceSeconds: 271,
          paceFormatted: "4:31",
          avgHeartRate: 168,
          maxHeartRate: 184,
          elevationGainM: 42,
          avgCadence: 182,
          shoeName: "Vaporfly 3",
          perceivedEffort: 8,
          bodyWeightKg: 72.4,
          notes: "Treino forte na pista",
          splits: [
            { splitNumber: 1, distanceKm: 1, durationSeconds: 268, paceFormatted: "4:28" },
          ],
          activeCalories: 610,
          totalCalories: 675,
          metValue: 11.5,
          calorieMethod: "compendium_2024",
          calorieSource: "fit",
          calorieMetadata: { formula: "ACSM" },
          createdAt: new Date("2026-10-12T10:00:00.000Z"),
          updatedAt: new Date("2026-10-12T10:00:00.000Z"),
        },
      },
      {
        id: "plan-cur-2",
        planExternalId: "p-cur-2",
        plannedDate: new Date("2026-10-15T12:00:00.000Z"),
        dayOfWeek: "Quinta",
        activityType: "Descanso",
        targetDistanceKm: null,
        targetPaceFormatted: null,
        description: "Dia off",
        status: "Concluído",
        matchedSessionId: null,
        matchedSession: null,
      },
      {
        id: "plan-cur-3",
        planExternalId: "p-cur-3",
        plannedDate: new Date("2026-10-17T12:00:00.000Z"),
        dayOfWeek: "Sábado",
        activityType: "Tempo Run",
        targetDistanceKm: 10,
        targetPaceFormatted: "4:55",
        description: null,
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
      // Semana futura além de 2026-10-18 (define hasNextPlannedWeek=true e deve ficar fora da rolling window de 2026-10-12)
      {
        id: "plan-next-1",
        planExternalId: "p-next-1",
        plannedDate: new Date("2026-10-19T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "Rodagem",
        targetDistanceKm: 5,
        targetPaceFormatted: "5:45",
        description: "Semana seguinte",
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);

    mockPrisma.trainingSession.findMany.mockResolvedValue([
      // Sessão noturna de domingo 18/10 às 22:30 BRT (19/10 01:30 UTC): pertence à semana 12/10..18/10!
      {
        id: "sess-extra-sun-night",
        userId: null,
        source: "manual",
        externalId: null,
        syncedToSheetsAt: null,
        sessionDate: new Date("2026-10-19T01:30:00.000Z"),
        activityType: "caminhada",
        distanceKm: 3.5,
        durationSeconds: 2100,
        elapsedSeconds: null,
        speedKmh: 6.0,
        paceSeconds: 600,
        paceFormatted: "10:00",
        avgHeartRate: 112,
        maxHeartRate: 124,
        elevationGainM: 10,
        avgCadence: 116,
        shoeName: "Pegasus 41",
        perceivedEffort: 3,
        bodyWeightKg: 72.4,
        notes: "Caminhada domingo à noite",
        splits: [],
        activeCalories: 190,
        totalCalories: 230,
        metValue: 3.8,
        calorieMethod: "compendium_2024",
        calorieSource: "manual",
        calorieMetadata: null,
        createdAt: new Date("2026-10-19T02:00:00.000Z"),
        updatedAt: new Date("2026-10-19T02:00:00.000Z"),
      },
      // Sessão na segunda 12/10 pareada via D+1 com o domingo 11/10 (não pode aparecer como extra)
      {
        id: "sess-prev-boundary",
        source: "manual",
        sessionDate: new Date("2026-10-12T10:00:00.000Z"),
        activityType: "longao",
        distanceKm: 14.0,
        durationSeconds: 4800,
        speedKmh: 10.5,
        paceSeconds: 343,
        paceFormatted: "5:43",
        splits: [],
        createdAt: new Date("2026-10-12T11:30:00.000Z"),
        updatedAt: new Date("2026-10-12T11:30:00.000Z"),
      },
      // Sessão noturna de domingo 11/10 às 23:00 BRT = 12/10 02:00 UTC (pertence à semana anterior, fora de 12/10..18/10)
      {
        id: "sess-outside-prev-night",
        source: "manual",
        sessionDate: new Date("2026-10-12T02:00:00.000Z"),
        activityType: "rodagem_leve",
        distanceKm: 5.0,
        durationSeconds: 1800,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        splits: [],
        createdAt: new Date("2026-10-12T02:40:00.000Z"),
        updatedAt: new Date("2026-10-12T02:40:00.000Z"),
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=2026-10-14")
    );
    expect(res.status).toBe(200);

    // Janela UTC com folga para fuso America/Fortaleza (11/10 00:00Z .. 20/10 23:59Z)
    expect(mockPrisma.trainingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          weeklyPlanItem: { is: null },
          sessionDate: {
            gte: new Date("2026-10-11T00:00:00.000Z"),
            lt: new Date("2026-10-20T23:59:59.999Z"),
          },
        }),
      })
    );

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.weekStart).toBe("2026-10-12");
    expect(json.data.weekEnd).toBe("2026-10-18");
    expect(json.data.weekLabel).toBe("12/10 – 18/10");
    expect(json.data.isCurrentWeek).toBe(true);
    expect(json.data.hasNextPlannedWeek).toBe(true);

    expect(json.data.items).toHaveLength(3);
    expect(json.data.items[1].isRestDay).toBe(true);

    // Payload completo de matchedSession para o TrainingDetailModal
    const matched = json.data.items[0].matchedSession;
    expect(matched).toMatchObject({
      id: "sess-cur-1",
      sessionDate: "2026-10-12T09:00:00.000Z",
      activityType: "corrida_intervalada",
      distanceKm: 8.2,
      durationSeconds: 2220,
      elapsedSeconds: 2300,
      paceFormatted: "4:31",
      speedKmh: 13.3,
      source: "fit_upload",
      avgHeartRate: 168,
      maxHeartRate: 184,
      elevationGainM: 42,
      avgCadence: 182,
      perceivedEffort: 8,
      bodyWeightKg: 72.4,
      shoeName: "Vaporfly 3",
      notes: "Treino forte na pista",
      activeCalories: 610,
      totalCalories: 675,
    });
    expect(matched.splits).toHaveLength(1);

    // Resumo da semana atual: 2 Concluídos + 0 Adaptado + 0 Parcial em 3 planejados => Math.round((2/3)*100) = 67%
    expect(json.data.summary).toEqual({
      totalPlanned: 3,
      completed: 2,
      adapted: 0,
      partial: 0,
      planned: 1,
      missed: 0,
      adherencePercent: 67,
    });

    // Média móvel das 4 semanas COM plano até 2026-10-12 (100%, 50%, 100%, 67% -> 79%)
    expect(json.data.rollingFourWeeksAverage.weeksCount).toBe(4);
    expect(json.data.rollingFourWeeksAverage.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual([
      "2026-09-14",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(json.data.rollingFourWeeksAverage.averagePercent).toBe(79);

    // Extras: apenas a caminhada noturna de domingo 18/10 (01:30Z do dia 19); exclui boundary pareada e domingo 11/10
    expect(json.data.extraSummary).toEqual({
      count: 1,
      totalDistanceKm: 3.5,
    });
    expect(json.data.extraSessions).toHaveLength(1);
    expect(json.data.extraSessions[0].id).toBe("sess-extra-sun-night");
  });

  it("define isCurrentWeek false ao consultar uma semana passada explícita", async () => {
    const res = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=2026-10-05")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.weekStart).toBe("2026-10-05");
    expect(json.data.weekEnd).toBe("2026-10-11");
    expect(json.data.isCurrentWeek).toBe(false);
  });

  it("retorna 400 para ?weekStart inválido, aceita ?weekStart= vazio como default e calcula hasNextPlannedWeek e rolling window até semana passada", async () => {
    const invalidRes = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=abc")
    );
    expect(invalidRes.status).toBe(400);

    const emptyParamRes = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=")
    );
    expect(emptyParamRes.status).toBe(200);

    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "p-old",
        planExternalId: "p-old",
        plannedDate: new Date("2026-09-28T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "Corrida Contínua",
        targetDistanceKm: 5,
        targetPaceFormatted: null,
        description: null,
        status: "Concluído",
        matchedSessionId: null,
        matchedSession: null,
      },
      {
        id: "p-target",
        planExternalId: "p-target",
        plannedDate: new Date("2026-10-06T12:00:00.000Z"),
        dayOfWeek: "Terça",
        activityType: "Tempo Run",
        targetDistanceKm: 8,
        targetPaceFormatted: "4:50",
        description: null,
        status: "Parcial",
        matchedSessionId: null,
        matchedSession: null,
      },
      {
        id: "p-future",
        planExternalId: "p-future",
        plannedDate: new Date("2026-10-14T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "Longão",
        targetDistanceKm: 12,
        targetPaceFormatted: "5:20",
        description: null,
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const pastPopulatedRes = await GET(
      new Request("http://localhost/api/weekly-plan?weekStart=2026-10-05")
    );
    expect(pastPopulatedRes.status).toBe(200);
    const json = await pastPopulatedRes.json();
    expect(json.data.hasNextPlannedWeek).toBe(true);
    expect(json.data.rollingFourWeeksAverage.weeksCount).toBe(2);
    expect(json.data.rollingFourWeeksAverage.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual([
      "2026-09-28",
      "2026-10-05",
    ]);
    // 100% + 50% -> 75%
    expect(json.data.rollingFourWeeksAverage.averagePercent).toBe(75);
  });

  it("retorna status Adaptado com adaptationReason/adaptationReasons e aplica peso 0.75 na aderência", async () => {
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "plan-adp-1",
        planExternalId: "PLAN-2026-10-12-1",
        plannedDate: new Date("2026-10-12T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "rodagem_leve",
        targetDistanceKm: 8,
        targetPaceFormatted: "5:45-6:00",
        description: "Rodagem Z2",
        status: "Adaptado",
        matchedSessionId: "sess-adp-1",
        matchedSession: {
          id: "sess-adp-1",
          source: "fit_upload",
          sessionDate: new Date("2026-10-12T09:00:00.000Z"),
          activityType: "rodagem_leve",
          distanceKm: 11.0,
          durationSeconds: 3410,
          speedKmh: 11.6,
          paceSeconds: 310,
          paceFormatted: "5:10",
          splits: [],
          createdAt: new Date("2026-10-12T10:00:00.000Z"),
          updatedAt: new Date("2026-10-12T10:00:00.000Z"),
        },
      },
      {
        id: "plan-ok-2",
        planExternalId: "PLAN-2026-10-14-1",
        plannedDate: new Date("2026-10-14T12:00:00.000Z"),
        dayOfWeek: "Quarta",
        activityType: "corrida_continua",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:20",
        description: null,
        status: "Concluído",
        matchedSessionId: "sess-ok-2",
        matchedSession: {
          id: "sess-ok-2",
          source: "fit_upload",
          sessionDate: new Date("2026-10-14T09:00:00.000Z"),
          activityType: "corrida_continua",
          distanceKm: 6.0,
          durationSeconds: 1920,
          speedKmh: 11.25,
          paceSeconds: 320,
          paceFormatted: "5:20",
          splits: [],
          createdAt: new Date("2026-10-14T10:00:00.000Z"),
          updatedAt: new Date("2026-10-14T10:00:00.000Z"),
        },
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const res = await GET(new Request("http://localhost/api/weekly-plan?weekStart=2026-10-12"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.items[0].status).toBe("Adaptado");
    expect(json.data.items[0].adaptationReasons).toEqual([
      "Volume acima do planejado",
      "Ritmo mais forte que o alvo",
    ]);
    expect(json.data.items[0].adaptationReason).toBe(
      "Volume acima do planejado · Ritmo mais forte que o alvo"
    );
    expect(json.data.items[1].adaptationReason).toBeNull();
    expect(json.data.items[1].adaptationReasons).toEqual([]);

    // (1.0 + 0.75) / 2 = 87.5% -> 88%
    expect(json.data.summary).toEqual({
      totalPlanned: 2,
      completed: 1,
      adapted: 1,
      partial: 0,
      planned: 0,
      missed: 0,
      adherencePercent: 88,
    });
    expect(json.data.rollingFourWeeksAverage.weeks[0].adapted).toBe(1);
    expect(mockSafeReconcileWeeklyPlans).not.toHaveBeenCalled();
  });

  it("executa virada semanal no domingo >= 22h BRT apenas quando existe plano para a próxima semana", async () => {
    // Domingo 18/10/2026 21:59 BRT === 19/10/2026 00:59Z -> ainda NÃO virou
    vi.setSystemTime(new Date("2026-10-19T00:59:00.000Z"));
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "p-next",
        planExternalId: "P-NEXT",
        plannedDate: new Date("2026-10-19T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "rodagem_leve",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:45",
        description: "Semana nova",
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const beforeRes = await GET(new Request("http://localhost/api/weekly-plan"));
    const beforeJson = await beforeRes.json();
    expect(beforeJson.data.isSundayRolloverWindow).toBe(false);
    expect(beforeJson.data.weekStart).toBe("2026-10-12");

    // Domingo 18/10/2026 22:00 BRT === 19/10/2026 01:00Z COM plano futuro -> vira para 2026-10-19
    vi.setSystemTime(new Date("2026-10-19T01:00:00.000Z"));
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "p-next",
        planExternalId: "P-NEXT",
        plannedDate: new Date("2026-10-19T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "rodagem_leve",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:45",
        description: "Semana nova",
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const afterWithNextRes = await GET(new Request("http://localhost/api/weekly-plan"));
    const afterWithNextJson = await afterWithNextRes.json();
    expect(afterWithNextJson.data.isSundayRolloverWindow).toBe(true);
    expect(afterWithNextJson.data.weekStart).toBe("2026-10-19");
    expect(afterWithNextJson.data.isCurrentWeek).toBe(true);
    expect(afterWithNextJson.data.items).toHaveLength(1);

    // Domingo 18/10/2026 22:00 BRT SEM plano futuro -> mantém semana encerrada (Mitigação R5)
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "p-cur",
        planExternalId: "P-CUR",
        plannedDate: new Date("2026-10-18T12:00:00.000Z"),
        dayOfWeek: "Domingo",
        activityType: "longao",
        targetDistanceKm: 12,
        targetPaceFormatted: "5:50",
        description: "Longão",
        status: "Concluído",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const afterWithoutNextRes = await GET(new Request("http://localhost/api/weekly-plan"));
    const afterWithoutNextJson = await afterWithoutNextRes.json();
    expect(afterWithoutNextJson.data.isSundayRolloverWindow).toBe(true);
    expect(afterWithoutNextJson.data.weekStart).toBe("2026-10-12");

    // Domingo 18/10/2026 22:00 BRT com plano APENAS em +14 dias (próxima semana imediata vazia) -> NÃO vira para semana vazia
    mockPrisma.weeklyPlanItem.findMany.mockResolvedValueOnce([
      {
        id: "p-far-future",
        planExternalId: "P-FAR",
        plannedDate: new Date("2026-10-26T12:00:00.000Z"),
        dayOfWeek: "Segunda",
        activityType: "rodagem_leve",
        targetDistanceKm: 6,
        targetPaceFormatted: "5:45",
        description: "Semana +2",
        status: "Planejado",
        matchedSessionId: null,
        matchedSession: null,
      },
    ]);
    mockPrisma.trainingSession.findMany.mockResolvedValueOnce([]);

    const afterFarFutureOnlyRes = await GET(new Request("http://localhost/api/weekly-plan"));
    const afterFarFutureOnlyJson = await afterFarFutureOnlyRes.json();
    expect(afterFarFutureOnlyJson.data.isSundayRolloverWindow).toBe(true);
    expect(afterFarFutureOnlyJson.data.weekStart).toBe("2026-10-12");
  });

  it("dispara reconciliação sob demanda e write-back no Sheets quando detecta plano vencido (Planejado -> Perdido)", async () => {
    mockIsGoogleSheetsConfigured.mockReturnValue(true);
    mockSafeReconcileWeeklyPlans.mockResolvedValueOnce({
      matched: 0,
      missed: 1,
      updatedCount: 1,
    });

    const overduePlan = {
      id: "p-overdue",
      planExternalId: "P-OVERDUE",
      plannedDate: new Date("2026-10-12T12:00:00.000Z"), // Segunda (anteontem frente à quarta 14/10)
      dayOfWeek: "Segunda",
      activityType: "rodagem_leve",
      targetDistanceKm: 6,
      targetPaceFormatted: "5:50",
      description: null,
      status: "Planejado",
      matchedSessionId: null,
      matchedSession: null,
    };

    mockPrisma.weeklyPlanItem.findMany
      .mockResolvedValueOnce([overduePlan])
      .mockResolvedValueOnce([{ ...overduePlan, status: "Perdido" }]);
    mockPrisma.trainingSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(new Request("http://localhost/api/weekly-plan?weekStart=2026-10-12"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockSafeReconcileWeeklyPlans).toHaveBeenCalledTimes(1);
    expect(mockPushWeeklyPlanStatusToSheets).toHaveBeenCalledTimes(1);
    expect(json.data.items[0].status).toBe("Perdido");
    expect(json.data.summary.missed).toBe(1);
  });
});
