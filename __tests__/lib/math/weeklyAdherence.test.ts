import { describe, it, expect } from "vitest";
import {
  arePlanActivitiesCompatible,
  calculateRollingFourWeeksAdherence,
  calculateWeeklyAdherenceSummary,
  computeUnmatchedPlanStatus,
  computeWeeklyReconciliation,
  diffFortalezaDays,
  evaluateLinkedSessionValidity,
  evaluateWeeklyMatch,
  getFortalezaWeekBounds,
  getFortalezaWeekdayLabel,
  isExactPlanActivityMatch,
  isRestPlanActivity,
  normalizePlanActivityType,
  normalizeWeeklyPlanStatus,
  shiftFortalezaDays,
  shiftFortalezaWeek,
  toFortalezaDateKey,
  type ReconcilablePlanItem,
  type ReconcilableSessionItem,
} from "@/lib/math/weeklyAdherence";

describe("Motor Puro de Aderência e Reconciliação Semanal (lib/math/weeklyAdherence.ts)", () => {
  describe("Calendário America/Fortaleza (UTC-3, Segunda a Domingo)", () => {
    it("normaliza datas perto da meia-noite UTC para o dia civil correto em Fortaleza", () => {
      // 2026-11-16 22:30 BRT === 2026-11-17 01:30Z -> deve permanecer 2026-11-16 em Fortaleza
      expect(toFortalezaDateKey("2026-11-17T01:30:00.000Z")).toBe("2026-11-16");
      expect(toFortalezaDateKey(new Date("2026-11-16T22:30:00-03:00"))).toBe("2026-11-16");
      expect(toFortalezaDateKey("2026-11-16")).toBe("2026-11-16");
      expect(toFortalezaDateKey("2026-02-30")).toBe("");
      expect(toFortalezaDateKey("invalida")).toBe("");
      expect(toFortalezaDateKey(null)).toBe("");
    });

    it("calcula diferença em dias civis, deslocamento e bounds semanais Segunda..Domingo", () => {
      expect(diffFortalezaDays("2026-11-17T01:30:00.000Z", "2026-11-16")).toBe(0);
      expect(diffFortalezaDays("2026-11-17", "2026-11-16")).toBe(1);
      expect(diffFortalezaDays("2026-11-15", "2026-11-16")).toBe(-1);
      expect(Number.isNaN(diffFortalezaDays("invalida", "2026-11-16"))).toBe(true);

      expect(shiftFortalezaDays("2026-11-16", -1)).toBe("2026-11-15");
      expect(shiftFortalezaDays("2026-11-16", 6)).toBe("2026-11-22");
      expect(shiftFortalezaDays("invalida", 1)).toBe("");

      // 2026-11-15 é Domingo -> semana 2026-11-09..2026-11-15
      expect(getFortalezaWeekBounds("2026-11-15")).toEqual({
        weekStart: "2026-11-09",
        weekEnd: "2026-11-15",
        label: "09/11 – 15/11",
      });

      // 2026-11-16 é Segunda -> semana 2026-11-16..2026-11-22
      expect(getFortalezaWeekBounds("2026-11-16")).toEqual({
        weekStart: "2026-11-16",
        weekEnd: "2026-11-22",
        label: "16/11 – 22/11",
      });

      expect(shiftFortalezaWeek("2026-11-18", -1)).toBe("2026-11-09");
      expect(shiftFortalezaWeek("2026-11-16", 1)).toBe("2026-11-23");
      expect(() => getFortalezaWeekBounds("invalida")).toThrow(RangeError);

      expect(getFortalezaWeekdayLabel("2026-11-16")).toBe("Segunda");
      expect(getFortalezaWeekdayLabel("2026-11-18")).toBe("Quarta");
      expect(getFortalezaWeekdayLabel("2026-11-22")).toBe("Domingo");
      expect(getFortalezaWeekdayLabel("invalida")).toBe("");
    });
  });

  describe("Normalização de Atividades, Famílias e Limiares de Conclusão", () => {
    it("normaliza aliases incluindo tiro, esteira, regenerativo e identifica descanso", () => {
      expect(normalizePlanActivityType("tiro")).toBe("corrida_intervalada");
      expect(normalizePlanActivityType("Tiro 400m na pista")).toBe("corrida_intervalada");
      expect(normalizePlanActivityType("esteira")).toBe("corrida_continua");
      expect(normalizePlanActivityType("Corrida na Esteira")).toBe("corrida_continua");
      expect(normalizePlanActivityType("regenerativo")).toBe("rodagem_leve");
      expect(normalizePlanActivityType("Tempo Run / Ritmo")).toBe("tempo_run");
      expect(normalizePlanActivityType("longo")).toBe("longao");
      expect(normalizePlanActivityType("Caminhada leve")).toBe("caminhada");

      expect(isRestPlanActivity("Descanso")).toBe(true);
      expect(isRestPlanActivity("off")).toBe(true);
      expect(isRestPlanActivity("Rest")).toBe(true);
      expect(isRestPlanActivity("rodagem_leve")).toBe(false);
      expect(normalizePlanActivityType("Descanso")).toBeNull();
      expect(normalizePlanActivityType("Natacao")).toBeNull();
      expect(normalizePlanActivityType(null)).toBeNull();
    });

    it("valida compatibilidade de família (Corrida vs Caminhada) e match exato", () => {
      expect(arePlanActivitiesCompatible("rodagem_leve", "corrida_continua")).toBe(true);
      expect(arePlanActivitiesCompatible("tiro", "corrida_continua")).toBe(true);
      expect(arePlanActivitiesCompatible("caminhada", "caminhada")).toBe(true);

      // Caminhada NUNCA satisfaz plano de corrida (nem vice-versa)
      expect(arePlanActivitiesCompatible("rodagem_leve", "caminhada")).toBe(false);
      expect(arePlanActivitiesCompatible("corrida_continua", "caminhada")).toBe(false);
      expect(arePlanActivitiesCompatible("caminhada", "corrida_continua")).toBe(false);
      expect(arePlanActivitiesCompatible("Descanso", "corrida_continua")).toBe(false);

      expect(isExactPlanActivityMatch("tiro", "corrida_intervalada")).toBe(true);
      expect(isExactPlanActivityMatch("rodagem_leve", "corrida_continua")).toBe(false);

      expect(normalizeWeeklyPlanStatus("Concluido")).toBe("Concluído");
      expect(normalizeWeeklyPlanStatus("'Concluído")).toBe("Concluído");
      expect(normalizeWeeklyPlanStatus("PARCIAL")).toBe("Parcial");
      expect(normalizeWeeklyPlanStatus("perdido")).toBe("Perdido");
      expect(normalizeWeeklyPlanStatus(undefined)).toBe("Planejado");
      expect(isRestPlanActivity("'Descanso")).toBe(true);
      expect(normalizePlanActivityType("'tiro")).toBe("corrida_intervalada");
      expect(normalizePlanActivityType("Run 5k")).toBe("corrida_continua");
    });

    it("respeita os limiares exatos de status (0.85, 0.849, 0.40, 0.399, null/0 e borda float)", () => {
      // Meta 10 km: 8.5 -> 0.85 (Concluído), 8.49 -> 0.849 (Parcial), 4.0 -> 0.40 (Parcial), 3.99 -> 0.399 (null)
      expect(evaluateWeeklyMatch(10, 8.5)).toBe("Concluído");
      expect(evaluateWeeklyMatch(10, 8.49)).toBe("Parcial");
      expect(evaluateWeeklyMatch(10, 4.0)).toBe("Parcial");
      expect(evaluateWeeklyMatch(10, 3.99)).toBeNull();

      // Precisão IEEE-754: 2.8 / 7 === 0.39999999999999997 deve ser 40% exato -> Parcial
      expect(evaluateWeeklyMatch(7, 2.8)).toBe("Parcial");
      expect(evaluateWeeklyMatch(7, 5.95)).toBe("Concluído");

      // Treino apenas por tempo (meta null ou 0) -> Concluído para sessão > 0
      expect(evaluateWeeklyMatch(null, 3.2)).toBe("Concluído");
      expect(evaluateWeeklyMatch(0, 1.5)).toBe("Concluído");
      expect(evaluateWeeklyMatch(5, 0)).toBeNull();
    });
  });

  describe("Reconciliação em 2 Passadas", () => {
    it("casa sessão às 22:30 BRT (01:30Z UTC seguinte) no mesmo dia do plano e rejeita aquecimento curto", () => {
      const result = computeWeeklyReconciliation(
        [
          {
            id: "plan-1",
            planExternalId: "PLAN-2026-11-16-1",
            plannedDate: new Date("2026-11-16T12:00:00.000Z"),
            activityType: "corrida_continua",
            targetDistanceKm: 5.0,
            status: "Planejado",
          },
        ],
        [
          // Aquecimento de 1,5 km (ratio = 0.30 < 0.40) com mesmo activityType
          {
            id: "sess-warmup",
            sessionDate: "2026-11-16T22:00:00-03:00",
            activityType: "corrida_continua",
            distanceKm: 1.5,
          },
          // Treino principal às 22:30 BRT === 01:30Z do dia 17 UTC
          {
            id: "sess-main",
            sessionDate: "2026-11-17T01:30:00.000Z",
            activityType: "corrida_continua",
            distanceKm: 5.1,
          },
        ],
        "2026-11-16"
      );

      expect(result.matches).toEqual([
        {
          planId: "plan-1",
          planExternalId: "PLAN-2026-11-16-1",
          sessionId: "sess-main",
          status: "Concluído",
          pass: 1,
          dayDiff: 0,
        },
      ]);
      expect(result.unmatchedUpdates).toEqual([]);
      expect(result.missedCount).toBe(0);
    });

    it("prioriza aquecimento rejeitado (< 0.40) sem impedir o principal mesmo quando são o único match no dia", () => {
      const onlyWarmup = computeWeeklyReconciliation(
        [
          {
            id: "plan-1",
            planExternalId: "PLAN-1",
            plannedDate: "2026-11-16",
            activityType: "rodagem_leve",
            targetDistanceKm: 5.0,
          },
        ],
        [
          {
            id: "sess-warmup",
            sessionDate: "2026-11-16T10:00:00-03:00",
            activityType: "rodagem_leve",
            distanceKm: 1.5,
          },
        ],
        "2026-11-16"
      );
      expect(onlyWarmup.matches).toEqual([]);
    });

    it("aplica Passada 2 (±1 dia) apenas quando o dia da sessão não possui plano ativo e atividade é compatível", () => {
      // Caso permitido: plano na Terça (17/11), sessão rodagem_leve/corrida_continua na Quarta (18/11) SEM plano na Quarta
      const allowed = computeWeeklyReconciliation(
        [
          {
            id: "plan-tue",
            planExternalId: "PLAN-TUE",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 6.0,
            status: "Planejado",
          },
        ],
        [
          {
            id: "sess-wed",
            sessionDate: "2026-11-18T09:00:00-03:00",
            activityType: "corrida_continua",
            distanceKm: 5.5,
          },
        ],
        "2026-11-18"
      );

      expect(allowed.matches).toHaveLength(1);
      expect(allowed.matches[0]).toMatchObject({
        planId: "plan-tue",
        sessionId: "sess-wed",
        status: "Concluído",
        pass: 2,
        dayDiff: 1,
      });

      // Caso bloqueado 1: sessão na Quarta (18/11) onde já existe outro plano ativo na Quarta
      const blockedByOtherPlan = computeWeeklyReconciliation(
        [
          {
            id: "plan-tue",
            planExternalId: "PLAN-TUE",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 6.0,
            status: "Planejado",
          },
          {
            id: "plan-wed",
            planExternalId: "PLAN-WED",
            plannedDate: "2026-11-18",
            activityType: "corrida_intervalada",
            targetDistanceKm: 10.0,
            status: "Concluído",
            matchedSessionId: "sess-already",
          },
        ],
        [
          {
            id: "sess-wed-extra",
            sessionDate: "2026-11-18T18:00:00-03:00",
            activityType: "corrida_continua",
            distanceKm: 6.0,
          },
        ],
        "2026-11-18"
      );
      expect(blockedByOtherPlan.matches).toEqual([]);

      // Caso bloqueado 2: caminhada contra plano de corrida em ±1 dia
      const blockedWalk = computeWeeklyReconciliation(
        [
          {
            id: "plan-tue",
            planExternalId: "PLAN-TUE",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 6.0,
          },
        ],
        [
          {
            id: "sess-walk",
            sessionDate: "2026-11-18T09:00:00-03:00",
            activityType: "caminhada",
            distanceKm: 6.0,
          },
        ],
        "2026-11-18"
      );
      expect(blockedWalk.matches).toEqual([]);

      // Passada 1 sempre executa antes da Passada 2 (mesmo dia vence ±1 dia)
      const pass1Priority = computeWeeklyReconciliation(
        [
          {
            id: "plan-mon",
            planExternalId: "PLAN-MON",
            plannedDate: "2026-11-16",
            activityType: "rodagem_leve",
            targetDistanceKm: 5.0,
          },
          {
            id: "plan-tue",
            planExternalId: "PLAN-TUE",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 5.0,
          },
        ],
        [
          {
            id: "sess-tue",
            sessionDate: "2026-11-17T08:00:00-03:00",
            activityType: "rodagem_leve",
            distanceKm: 5.0,
          },
        ],
        "2026-11-17"
      );
      expect(pass1Priority.matches).toEqual([
        expect.objectContaining({
          planId: "plan-tue",
          sessionId: "sess-tue",
          pass: 1,
        }),
      ]);
    });

    it("marca Perdido estritamente para plannedDate < ontem e mantém ontem/hoje/futuro como Planejado", () => {
      const today = "2026-11-18"; // ontem = 2026-11-17
      expect(computeUnmatchedPlanStatus("2026-11-16", today)).toBe("Perdido");
      expect(computeUnmatchedPlanStatus("2026-11-17", today)).toBe("Planejado");
      expect(computeUnmatchedPlanStatus("2026-11-18", today)).toBe("Planejado");
      expect(computeUnmatchedPlanStatus("2026-11-19", today)).toBe("Planejado");

      const rec = computeWeeklyReconciliation(
        [
          {
            id: "p-anteontem",
            planExternalId: "P-16",
            plannedDate: "2026-11-16",
            activityType: "rodagem_leve",
            targetDistanceKm: 5,
            status: "Planejado",
          },
          {
            id: "p-ontem",
            planExternalId: "P-17",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 5,
            status: "Planejado",
          },
          {
            id: "p-hoje",
            planExternalId: "P-18",
            plannedDate: "2026-11-18",
            activityType: "rodagem_leve",
            targetDistanceKm: 5,
            status: "Planejado",
          },
        ],
        [],
        today
      );

      expect(rec.missedCount).toBe(1);
      expect(rec.unmatchedUpdates).toEqual([
        {
          planId: "p-anteontem",
          planExternalId: "P-16",
          previousStatus: "Planejado",
          nextStatus: "Perdido",
        },
      ]);
    });

    it("valida integridade do vínculo existente após edição de sessão", () => {
      const plan = {
        plannedDate: "2026-11-16",
        activityType: "rodagem_leve",
        targetDistanceKm: 10,
      };
      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-16T18:00:00-03:00",
          activityType: "corrida_continua",
          distanceKm: 6.0,
        })
      ).toEqual({ valid: true, nextStatus: "Parcial" });

      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-19T18:00:00-03:00",
          activityType: "rodagem_leve",
          distanceKm: 10,
        })
      ).toEqual({ valid: false, nextStatus: null });

      expect(
        evaluateLinkedSessionValidity(
          plan,
          {
            sessionDate: "2026-11-17T18:00:00-03:00",
            activityType: "rodagem_leve",
            distanceKm: 10,
          },
          { hasSameDayPlanAtSessionDate: true }
        )
      ).toEqual({ valid: false, nextStatus: null });

      // Atividade incompatível (caminhada) ou volume abaixo de 40% invalidam vínculo após edição
      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-16T18:00:00-03:00",
          activityType: "caminhada",
          distanceKm: 10,
        })
      ).toEqual({ valid: false, nextStatus: null });

      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-16T18:00:00-03:00",
          activityType: "rodagem_leve",
          distanceKm: 3.5,
        })
      ).toEqual({ valid: false, nextStatus: null });
    });
  });

  describe("Resumo de Aderência Semanal e Média das 4 Semanas", () => {
    it("retorna null em semanas vazias (sem NaN) e calcula Math.round + teto de 100%", () => {
      expect(calculateWeeklyAdherenceSummary([])).toEqual({
        totalPlanned: 0,
        completed: 0,
        partial: 0,
        planned: 0,
        missed: 0,
        adherencePercent: null,
      });

      const summary = calculateWeeklyAdherenceSummary([
        { status: "Concluído" },
        { status: "Parcial" },
        { status: "Perdido" },
        { status: "Planejado" },
      ]);
      // (1 + 0.5) / 4 = 37.5% -> Math.round = 38%
      expect(summary).toEqual({
        totalPlanned: 4,
        completed: 1,
        partial: 1,
        planned: 1,
        missed: 1,
        adherencePercent: 38,
      });

      const full = calculateWeeklyAdherenceSummary([
        { status: "Concluído" },
        { status: "Concluído" },
      ]);
      expect(full.adherencePercent).toBe(100);
    });

    it("calcula média das últimas até 4 semanas com plano ignorando semanas intermediárias vazias", () => {
      expect(calculateRollingFourWeeksAdherence([])).toEqual({
        averagePercent: null,
        weeksCount: 0,
        weeks: [],
      });

      const items = [
        // Semana 1 (2026-09-28): 1/1 -> 100% (deve ficar de fora por ser a 5ª mais recente)
        { plannedDate: "2026-09-28", status: "Concluído" },
        // Semana 2 (2026-10-05): 0/2 -> 0%
        { plannedDate: "2026-10-05", status: "Perdido" },
        { plannedDate: "2026-10-07", status: "Perdido" },
        // Semana 2026-10-12: SEM PLANOS (lacuna ignorada!)
        // Semana 3 (2026-10-19): 2/2 -> 100%
        { plannedDate: "2026-10-19", status: "Concluído" },
        { plannedDate: "2026-10-21", status: "Concluído" },
        // Semana 4 (2026-10-26): 1 Parcial / 1 -> 50%
        { plannedDate: "2026-10-26", status: "Parcial" },
        // Semana 5 (2026-11-16): 1 Concluído + 1 Perdido / 2 -> 50%
        { plannedDate: "2026-11-16", status: "Concluído" },
        { plannedDate: "2026-11-18", status: "Perdido" },
        // Semana futura (2026-11-23): deve ser filtrada por upToWeekStartKey="2026-11-16"
        { plannedDate: "2026-11-23", status: "Planejado" },
      ];

      // 4 semanas consideradas até 2026-11-16: 0%, 100%, 50%, 50% -> média = 200 / 4 = 50%
      const rolling = calculateRollingFourWeeksAdherence(items, "2026-11-16");
      expect(rolling.weeksCount).toBe(4);
      expect(rolling.averagePercent).toBe(50);
      expect(rolling.weeks.map((w) => [w.weekStart, w.adherencePercent])).toEqual([
        ["2026-10-05", 0],
        ["2026-10-19", 100],
        ["2026-10-26", 50],
        ["2026-11-16", 50],
      ]);

      // Ignora plannedDate inválido sem quebrar a média
      const withInvalidDate = calculateRollingFourWeeksAdherence([
        { plannedDate: "data-invalida", status: "Concluído" },
      ]);
      expect(withInvalidDate).toEqual({
        averagePercent: null,
        weeksCount: 0,
        weeks: [],
      });
    });

    it("cobre competição multi-plano/multi-sessão na mesma passada, datas inválidas em evaluateLinkedSessionValidity e edge cases de helpers", () => {
      // Competição multi-plano com sessões compartilhadas na Passada 1:
      // Garante execução de L596-597 (`usedPlanIds` / `usedSessionIds` já consumidos) + ranking completo
      const plans: ReconcilablePlanItem[] = [
        {
          id: "p-exact",
          planExternalId: "P-1",
          plannedDate: "2026-11-17",
          activityType: "tempo_run",
          targetDistanceKm: 8,
          status: "Planejado",
          matchedSessionId: null,
        },
        {
          id: "p-time-only",
          planExternalId: "P-2",
          plannedDate: "2026-11-17",
          activityType: "rodagem_leve",
          targetDistanceKm: null,
          status: "Planejado",
          matchedSessionId: null,
        },
        {
          id: "p-rest-ignored",
          planExternalId: "P-REST",
          plannedDate: "2026-11-18",
          activityType: "Descanso",
          targetDistanceKm: null,
          status: "Planejado",
          matchedSessionId: null,
        },
      ];

      const sessions: ReconcilableSessionItem[] = [
        {
          id: "s-tempo",
          sessionDate: new Date("2026-11-17T10:00:00.000Z"),
          activityType: "tempo_run",
          distanceKm: 8.1,
          durationSeconds: 2300,
        },
        {
          id: "s-long-effort",
          sessionDate: new Date("2026-11-17T15:00:00.000Z"),
          activityType: "corrida_continua",
          distanceKm: 6.5,
          durationSeconds: 2600,
        },
      ];

      const res = computeWeeklyReconciliation(plans, sessions, "2026-11-17");
      expect(res.matches).toEqual([
        expect.objectContaining({ planId: "p-exact", sessionId: "s-tempo", status: "Concluído" }),
        expect.objectContaining({
          planId: "p-time-only",
          sessionId: "s-long-effort",
          status: "Concluído",
        }),
      ]);

      // evaluateLinkedSessionValidity com datas inválidas (L655-656)
      expect(
        evaluateLinkedSessionValidity(
          {
            plannedDate: "data-invalida",
            activityType: "corrida_continua",
            targetDistanceKm: 5,
          },
          {
            sessionDate: new Date("2026-11-17T10:00:00.000Z"),
            activityType: "corrida_continua",
            distanceKm: 5,
          }
        )
      ).toEqual({ valid: false, nextStatus: null });

      expect(
        evaluateLinkedSessionValidity(
          {
            plannedDate: "2026-11-17",
            activityType: "corrida_continua",
            targetDistanceKm: 5,
          },
          {
            sessionDate: "invalida",
            activityType: "corrida_continua",
            distanceKm: 5,
          }
        )
      ).toEqual({ valid: false, nextStatus: null });

      // Helpers defensivos com entrada inválida / descanso / desconhecido
      expect(shiftFortalezaDays("invalida", 1)).toBe("");
      expect(computeUnmatchedPlanStatus("invalida", "2026-11-17")).toBe("Planejado");
      expect(arePlanActivitiesCompatible("corrida_continua", "Descanso")).toBe(false);
      expect(arePlanActivitiesCompatible("Atividade Alienígena", "corrida_continua")).toBe(false);
    });
  });
});
