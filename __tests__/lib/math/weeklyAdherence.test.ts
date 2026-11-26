import { describe, it, expect } from "vitest";
import {
  arePlanActivitiesCompatible,
  calculateRollingFourWeeksAdherence,
  calculateWeeklyAdherenceSummary,
  classifyActivityIntensityMismatch,
  computeUnmatchedPlanStatus,
  computeWeeklyReconciliation,
  diffFortalezaDays,
  evaluateLinkedSessionValidity,
  evaluateWeeklyMatch,
  evaluateWeeklyMatchDetailed,
  getDefaultDisplayWeekStartFortaleza,
  getFortalezaWeekBounds,
  getFortalezaWeekdayLabel,
  isExactPlanActivityMatch,
  isRealizedWeeklyPlanStatus,
  isRestPlanActivity,
  isSundayPostRolloverFortaleza,
  normalizePlanActivityType,
  normalizeWeeklyPlanStatus,
  parseTargetPaceRangeSeconds,
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

    it("detecta corretamente a virada dominical >= 22h em America/Fortaleza (independente do fuso do host)", () => {
      // Domingo 2026-11-22 21:59 BRT === 2026-11-23 00:59Z
      const sun2159 = new Date("2026-11-23T00:59:59.000Z");
      // Domingo 2026-11-22 22:00 BRT === 2026-11-23 01:00Z
      const sun2200 = new Date("2026-11-23T01:00:00.000Z");
      // Domingo 2026-11-22 23:59 BRT === 2026-11-23 02:59Z
      const sun2359 = new Date("2026-11-23T02:59:59.000Z");
      // Segunda 2026-11-23 00:05 BRT === 2026-11-23 03:05Z
      const mon0005 = new Date("2026-11-23T03:05:00.000Z");
      // Sábado 2026-11-21 22:30 BRT === 2026-11-22 01:30Z
      const sat2230 = new Date("2026-11-22T01:30:00.000Z");

      expect(isSundayPostRolloverFortaleza(sun2159)).toBe(false);
      expect(isSundayPostRolloverFortaleza(sun2200)).toBe(true);
      expect(isSundayPostRolloverFortaleza(sun2359)).toBe(true);
      expect(isSundayPostRolloverFortaleza(mon0005)).toBe(false);
      expect(isSundayPostRolloverFortaleza(sat2230)).toBe(false);
      expect(isSundayPostRolloverFortaleza(new Date("invalid"))).toBe(false);

      // Semana padrão exibida: só antecipa no domingo >= 22h quando hasNextPlannedWeek=true
      expect(getDefaultDisplayWeekStartFortaleza(sun2159, true)).toBe("2026-11-16");
      expect(getDefaultDisplayWeekStartFortaleza(sun2200, false)).toBe("2026-11-16");
      expect(getDefaultDisplayWeekStartFortaleza(sun2200, true)).toBe("2026-11-23");
      expect(getDefaultDisplayWeekStartFortaleza(mon0005, false)).toBe("2026-11-23");
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

      // Troca de família (caminhada) no mesmo dia vira Adaptado; em ±1 dia invalida o vínculo
      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-16T18:00:00-03:00",
          activityType: "caminhada",
          distanceKm: 10,
        })
      ).toEqual({ valid: true, nextStatus: "Adaptado" });

      expect(
        evaluateLinkedSessionValidity(plan, {
          sessionDate: "2026-11-17T18:00:00-03:00",
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

  describe("5º Status Adaptado (Volume, Pace ±15s/km, Intensidade e Precedência)", () => {
    it("normaliza status Adaptado e identifica todos os status realizados via isRealizedWeeklyPlanStatus", () => {
      expect(normalizeWeeklyPlanStatus("Adaptado")).toBe("Adaptado");
      expect(normalizeWeeklyPlanStatus("'Adaptado")).toBe("Adaptado");
      expect(normalizeWeeklyPlanStatus("adaptada")).toBe("Adaptado");
      expect(normalizeWeeklyPlanStatus("ADAPTED")).toBe("Adaptado");

      expect(isRealizedWeeklyPlanStatus("Concluído")).toBe(true);
      expect(isRealizedWeeklyPlanStatus("Adaptado")).toBe(true);
      expect(isRealizedWeeklyPlanStatus("Parcial")).toBe(true);
      expect(isRealizedWeeklyPlanStatus("Planejado")).toBe(false);
      expect(isRealizedWeeklyPlanStatus("Perdido")).toBe(false);
    });

    it("extrai faixas e valores únicos de pace em parseTargetPaceRangeSeconds", () => {
      expect(parseTargetPaceRangeSeconds("'5:45-6:00")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("5:45–6:00")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("5:45 a 6:00/km")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("5'45\" até 6'00\"")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("05:45:00 - 06:00:00")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("6:00-5:45")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });
      expect(parseTargetPaceRangeSeconds("5:13")).toEqual({
        minPaceSeconds: 313,
        maxPaceSeconds: 313,
      });
      expect(parseTargetPaceRangeSeconds("00:05:13")).toEqual({
        minPaceSeconds: 313,
        maxPaceSeconds: 313,
      });
      expect(parseTargetPaceRangeSeconds("Z2 (5:50-6:10/km)")).toEqual({
        minPaceSeconds: 350,
        maxPaceSeconds: 370,
      });
      expect(parseTargetPaceRangeSeconds("-")).toBeNull();
      expect(parseTargetPaceRangeSeconds("Livre")).toBeNull();
      expect(parseTargetPaceRangeSeconds("5:65")).toBeNull();
      expect(parseTargetPaceRangeSeconds("05:45:30")).toBeNull();
      expect(parseTargetPaceRangeSeconds("5:10-5:20-5:30")).toBeNull();
      expect(parseTargetPaceRangeSeconds(null)).toBeNull();
    });

    it("detecta choque de intensidade/família em classifyActivityIntensityMismatch", () => {
      expect(classifyActivityIntensityMismatch("corrida_intervalada", "rodagem_leve")).toBe(true);
      expect(classifyActivityIntensityMismatch("tempo_run", "caminhada")).toBe(true);
      expect(classifyActivityIntensityMismatch("rodagem_leve", "tempo_run")).toBe(true);
      expect(classifyActivityIntensityMismatch("rodagem_leve", "caminhada")).toBe(true);
      expect(classifyActivityIntensityMismatch("caminhada", "corrida_continua")).toBe(true);

      expect(classifyActivityIntensityMismatch("rodagem_leve", "corrida_continua")).toBe(false);
      expect(classifyActivityIntensityMismatch("corrida_intervalada", "tempo_run")).toBe(false);
      expect(classifyActivityIntensityMismatch("longao", "corrida_continua")).toBe(false);
      expect(classifyActivityIntensityMismatch("Descanso", "rodagem_leve")).toBe(false);
      expect(classifyActivityIntensityMismatch("Natacao", "rodagem_leve")).toBe(false);
    });

    it("classifica Adaptado nos desvios de volume (>1.25), pace (±15s/km), tipo e preserva precedência Parcial", () => {
      // Limite exato de volume: 1.25 -> Concluído; 1.26 -> Adaptado
      expect(evaluateWeeklyMatch(10, 12.5)).toBe("Concluído");
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 10, targetPaceFormatted: "5:45-6:00" },
          { activityType: "rodagem_leve", distanceKm: 12.6, paceSeconds: 350 }
        )
      ).toEqual({
        status: "Adaptado",
        reasonCodes: ["volume_above"],
        reasons: ["Volume acima do planejado"],
      });

      // Tolerância inclusiva de pace ±15s/km em '5:45-6:00 (345..360 -> 330..375 aceito)
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 10, targetPaceFormatted: "'5:45-6:00" },
          { activityType: "rodagem_leve", distanceKm: 10, paceSeconds: 330 }
        ).status
      ).toBe("Concluído");
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 10, targetPaceFormatted: "'5:45-6:00" },
          { activityType: "rodagem_leve", distanceKm: 10, paceSeconds: 375 }
        ).status
      ).toBe("Concluído");

      // 16s mais rápido -> pace_faster; 16s mais lento -> pace_slower (usando fallback durationSeconds)
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 10, targetPaceFormatted: "'5:45-6:00" },
          { activityType: "rodagem_leve", distanceKm: 10, paceSeconds: 329 }
        )
      ).toEqual({
        status: "Adaptado",
        reasonCodes: ["pace_faster"],
        reasons: ["Ritmo mais forte que o alvo"],
      });
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 10, targetPaceFormatted: "'5:45-6:00" },
          { activityType: "rodagem_leve", distanceKm: 10, durationSeconds: 3760 }
        )
      ).toEqual({
        status: "Adaptado",
        reasonCodes: ["pace_slower"],
        reasons: ["Ritmo mais lento que o alvo"],
      });

      // Precedência: 0.40 <= ratio < 0.85 continua Parcial (0.50) mesmo com pace/tipo desviados
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "corrida_intervalada", targetDistanceKm: 10, targetPaceFormatted: "4:30" },
          { activityType: "rodagem_leve", distanceKm: 6.0, paceSeconds: 380 }
        )
      ).toEqual({
        status: "Parcial",
        reasonCodes: [],
        reasons: [],
      });

      // Múltiplos motivos simultâneos
      expect(
        evaluateWeeklyMatchDetailed(
          { activityType: "rodagem_leve", targetDistanceKm: 8, targetPaceFormatted: "5:45-6:00" },
          { activityType: "corrida_intervalada", distanceKm: 11, paceSeconds: 290 }
        )
      ).toEqual({
        status: "Adaptado",
        reasonCodes: ["volume_above", "pace_faster", "type_changed"],
        reasons: [
          "Volume acima do planejado",
          "Ritmo mais forte que o alvo",
          "Tipo alterado",
        ],
      });
    });

    it("permite fallback run ↔ walk na Passada 1 com menor prioridade que mesma família e protege Adaptado no computeWeeklyReconciliation", () => {
      // No mesmo dia, caminhada de 6 km casa com rodagem_leve de 6 km como Adaptado quando não há corrida
      const swapSameDay = computeWeeklyReconciliation(
        [
          {
            id: "p-1",
            planExternalId: "PLAN-SWAP",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 6,
            status: "Planejado",
          },
        ],
        [
          {
            id: "s-walk",
            sessionDate: "2026-11-17T09:00:00-03:00",
            activityType: "caminhada",
            distanceKm: 6,
            paceSeconds: 600,
          },
        ],
        "2026-11-17"
      );
      expect(swapSameDay.matches).toEqual([
        {
          planId: "p-1",
          planExternalId: "PLAN-SWAP",
          sessionId: "s-walk",
          status: "Adaptado",
          pass: 1,
          dayDiff: 0,
        },
      ]);

      // Quando há corrida E caminhada no mesmo dia, corrida (mesma família) vence caminhada
      const sameFamilyWins = computeWeeklyReconciliation(
        [
          {
            id: "p-1",
            planExternalId: "PLAN-RUN",
            plannedDate: "2026-11-17",
            activityType: "rodagem_leve",
            targetDistanceKm: 6,
            status: "Planejado",
          },
        ],
        [
          {
            id: "s-walk-exact-dist",
            sessionDate: "2026-11-17T08:00:00-03:00",
            activityType: "caminhada",
            distanceKm: 6.0,
          },
          {
            id: "s-run-slight-diff",
            sessionDate: "2026-11-17T09:00:00-03:00",
            activityType: "corrida_continua",
            distanceKm: 5.8,
          },
        ],
        "2026-11-17"
      );
      expect(sameFamilyWins.matches[0]?.sessionId).toBe("s-run-slight-diff");
      expect(sameFamilyWins.matches[0]?.status).toBe("Concluído");

      // Plano já Adaptado não entra novamente como pendente
      const alreadyAdapted = computeWeeklyReconciliation(
        [
          {
            id: "p-adp",
            planExternalId: "PLAN-ADP",
            plannedDate: "2026-11-10",
            activityType: "rodagem_leve",
            targetDistanceKm: 6,
            status: "Adaptado",
            matchedSessionId: null,
          },
        ],
        [],
        "2026-11-17"
      );
      expect(alreadyAdapted.unmatchedUpdates).toEqual([]);
      expect(alreadyAdapted.missedCount).toBe(0);
    });
  });

  describe("Resumo de Aderência Semanal e Média das 4 Semanas", () => {
    it("retorna null em semanas vazias (sem NaN) e calcula fórmula 1.0 / 0.75 / 0.50 com Math.round + teto de 100%", () => {
      expect(calculateWeeklyAdherenceSummary([])).toEqual({
        totalPlanned: 0,
        completed: 0,
        adapted: 0,
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
        adapted: 0,
        partial: 1,
        planned: 1,
        missed: 1,
        adherencePercent: 38,
      });

      const withAdapted = calculateWeeklyAdherenceSummary([
        { status: "Concluído" },
        { status: "Adaptado" },
        { status: "Parcial" },
        { status: "Perdido" },
      ]);
      // (1.0 + 0.75 + 0.50) / 4 = 2.25 / 4 = 56.25% -> Math.round = 56%
      expect(withAdapted).toEqual({
        totalPlanned: 4,
        completed: 1,
        adapted: 1,
        partial: 1,
        planned: 0,
        missed: 1,
        adherencePercent: 56,
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

      // Semanas com itens Adaptado aplicam peso 0.75 e contabilizam week.adapted corretamente
      const rollingWithAdapted = calculateRollingFourWeeksAdherence(
        [
          // Semana A (2026-11-09): 1 Concluído (1.0) + 1 Adaptado (0.75) => 88%
          { plannedDate: "2026-11-09", status: "Concluído" },
          { plannedDate: "2026-11-11", status: "Adaptado" },
          // Semana B (2026-11-16): 1 Adaptado (0.75) + 1 Parcial (0.50) => 63%
          { plannedDate: "2026-11-16", status: "Adaptado" },
          { plannedDate: "2026-11-18", status: "Parcial" },
        ],
        "2026-11-16"
      );
      expect(rollingWithAdapted.weeksCount).toBe(2);
      expect(rollingWithAdapted.weeks).toEqual([
        expect.objectContaining({
          weekStart: "2026-11-09",
          completed: 1,
          adapted: 1,
          partial: 0,
          adherencePercent: 88,
        }),
        expect.objectContaining({
          weekStart: "2026-11-16",
          completed: 0,
          adapted: 1,
          partial: 1,
          adherencePercent: 63,
        }),
      ]);
      // Média (88 + 63) / 2 = 75.5 -> 76%
      expect(rollingWithAdapted.averagePercent).toBe(76);
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

      // Apóstrofo tipográfico U+2019 e prioridade de Concluído sobre Adaptado no mesmo dia
      expect(parseTargetPaceRangeSeconds("5’45”-6’00”")).toEqual({
        minPaceSeconds: 345,
        maxPaceSeconds: 360,
      });

      const rankingRes = computeWeeklyReconciliation(
        [
          {
            id: "p-rank",
            planExternalId: "PLAN-2026-11-18-1",
            plannedDate: new Date("2026-11-18T12:00:00.000Z"),
            activityType: "rodagem_leve",
            targetDistanceKm: 8,
            targetPaceFormatted: "5:45-6:00",
          },
        ],
        [
          {
            id: "s-exact-dist-fast-pace",
            sessionDate: new Date("2026-11-18T09:00:00.000Z"),
            activityType: "rodagem_leve",
            distanceKm: 8.0, // delta 0, mas pace 5:00 -> Adaptado
            durationSeconds: 2400,
            paceSeconds: 300,
          },
          {
            id: "s-slight-delta-on-pace",
            sessionDate: new Date("2026-11-18T10:00:00.000Z"),
            activityType: "rodagem_leve",
            distanceKm: 8.2, // delta 0.2, pace 5:50 -> Concluído
            durationSeconds: 2870,
            paceSeconds: 350,
          },
        ],
        "2026-11-18"
      );
      expect(rankingRes.matches).toEqual([
        expect.objectContaining({
          planId: "p-rank",
          sessionId: "s-slight-delta-on-pace",
          status: "Concluído",
        }),
      ]);
    });
  });
});
