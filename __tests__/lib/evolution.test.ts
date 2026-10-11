import { describe, it, expect } from "vitest";
import {
  processTafAttempts,
  getPersonalRecord,
  calculateWeightedAveragePace,
  getWeeklyVolume,
  getMonthlyVolume,
  getRecordEvolutionProgression,
  calculatePeriodMetrics,
  comparePeriods,
  sortAttemptsChronological,
} from "@/lib/math/evolution";
import { TafAttempt, TrainingSession } from "@/types";

describe("lib/math/evolution.ts — Motor Matemático de Evolução do TAF", () => {
  const baseAttempt = (partial: Partial<TafAttempt>): TafAttempt => ({
    id: "att-1",
    testDate: "2026-10-01T10:00:00Z",
    targetDurationSeconds: 720,
    actualDurationSeconds: 720,
    distanceMeters: 2200,
    speedKmh: 11.0,
    paceSeconds: 327,
    paceFormatted: "5:27",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...partial,
  });

  const baseTraining = (partial: Partial<TrainingSession>): TrainingSession => ({
    id: "tr-1",
    sessionDate: "2026-10-01T07:00:00Z",
    activityType: "corrida_continua",
    distanceKm: 5.0,
    durationSeconds: 1800,
    speedKmh: 10.0,
    paceSeconds: 360,
    paceFormatted: "6:00",
    perceivedEffort: 7,
    bodyWeightKg: 75.0,
    createdAt: "2026-10-01T07:00:00Z",
    updatedAt: "2026-10-01T07:00:00Z",
    ...partial,
  });

  describe("Ordenação cronológica", () => {
    it("ordena da data mais antiga para a mais recente", () => {
      const a1 = baseAttempt({ id: "1", testDate: "2026-10-05T10:00:00Z" });
      const a2 = baseAttempt({ id: "2", testDate: "2026-10-01T10:00:00Z" });
      const a3 = baseAttempt({ id: "3", testDate: "2026-10-10T10:00:00Z" });

      const sorted = sortAttemptsChronological([a1, a2, a3]);
      expect(sorted.map((a) => a.id)).toEqual(["2", "1", "3"]);
    });
  });

  describe("processTafAttempts & Regra de Recorde de Mesma Duração", () => {
    it("retorna lista vazia se não houver tentativas", () => {
      expect(processTafAttempts([])).toEqual([]);
      expect(processTafAttempts(null as never)).toEqual([]);
    });

    it("atribui recorde pessoal e delta null ao primeiro teste", () => {
      const att = baseAttempt({ distanceMeters: 2250 });
      const [res] = processTafAttempts([att], 2300);

      expect(res.isPersonalRecord).toBe(true);
      expect(res.deltaPreviousMeters).toBeNull();
      expect(res.deficitTargetMeters).toBe(50); // 2300 - 2250
    });

    it("calcula delta positivo quando o teste seguinte evolui", () => {
      const a1 = baseAttempt({ id: "1", testDate: "2026-10-01", distanceMeters: 2150 });
      const a2 = baseAttempt({ id: "2", testDate: "2026-10-08", distanceMeters: 2310 });

      const processed = processTafAttempts([a1, a2], 2300);
      // Retorno vem ordenado mais recente primeiro
      const latest = processed.find((a) => a.id === "2")!;
      const oldest = processed.find((a) => a.id === "1")!;

      expect(oldest.isPersonalRecord).toBe(true);
      expect(oldest.deltaPreviousMeters).toBeNull();

      expect(latest.isPersonalRecord).toBe(true);
      expect(latest.deltaPreviousMeters).toBe(160); // 2310 - 2150
      expect(latest.deficitTargetMeters).toBe(-10); // superou em 10m
    });

    it("marca isPersonalRecord=false e delta negativo quando o teste é inferior", () => {
      const a1 = baseAttempt({ id: "1", testDate: "2026-10-01", distanceMeters: 2350 });
      const a2 = baseAttempt({ id: "2", testDate: "2026-10-08", distanceMeters: 2280 });

      const processed = processTafAttempts([a1, a2]);
      const latest = processed.find((a) => a.id === "2")!;

      expect(latest.isPersonalRecord).toBe(false);
      expect(latest.deltaPreviousMeters).toBe(-70);
    });

    it("REGRA DE OURO: testes com targetDurationSeconds diferentes têm recordes e deltas isolados", () => {
      // Teste 1: 12 min (720s) -> 2200m
      const a1 = baseAttempt({
        id: "1",
        testDate: "2026-10-01",
        targetDurationSeconds: 720,
        distanceMeters: 2200,
      });
      // Teste 2: 10 min (600s) -> 1900m (não deve disputar com o teste de 12 min)
      const a2 = baseAttempt({
        id: "2",
        testDate: "2026-10-03",
        targetDurationSeconds: 600,
        distanceMeters: 1900,
      });
      // Teste 3: 12 min (720s) -> 2280m (deve comparar com a1, não com a2)
      const a3 = baseAttempt({
        id: "3",
        testDate: "2026-10-05",
        targetDurationSeconds: 720,
        distanceMeters: 2280,
      });

      const processed = processTafAttempts([a1, a2, a3]);
      const resA3 = processed.find((a) => a.id === "3")!;
      const resA2 = processed.find((a) => a.id === "2")!;

      expect(resA2.isPersonalRecord).toBe(true); // primeiro teste da duração de 10 min
      expect(resA2.deltaPreviousMeters).toBeNull();

      expect(resA3.isPersonalRecord).toBe(true); // superou a1 (2280 > 2200)
      expect(resA3.deltaPreviousMeters).toBe(80); // 2280 - 2200 (ignorou o a2 de 600s)
    });
  });

  describe("getPersonalRecord", () => {
    it("retorna null para array vazio", () => {
      expect(getPersonalRecord([])).toBeNull();
    });

    it("retorna o teste com maior distância da duração solicitada", () => {
      const a1 = baseAttempt({ id: "1", targetDurationSeconds: 720, distanceMeters: 2200 });
      const a2 = baseAttempt({ id: "2", targetDurationSeconds: 720, distanceMeters: 2420 });
      const a3 = baseAttempt({ id: "3", targetDurationSeconds: 600, distanceMeters: 2500 });

      const pr12m = getPersonalRecord([a1, a2, a3], 720);
      expect(pr12m?.id).toBe("2");
      expect(pr12m?.distanceMeters).toBe(2420);

      const pr10m = getPersonalRecord([a1, a2, a3], 600);
      expect(pr10m?.id).toBe("3");
    });
  });

  describe("calculateWeightedAveragePace", () => {
    it("retorna zeros quando não há treinos válidos", () => {
      const res = calculateWeightedAveragePace([]);
      expect(res.averagePaceSeconds).toBe(0);
      expect(res.averagePaceFormatted).toBe("0:00");
      expect(res.averageSpeedKmh).toBe(0);
    });

    it("calcula pace ponderado por distância corretamente", () => {
      // Treino 1: 10 km a 300 s/km (5:00) -> 3000 seg
      // Treino 2: 2 km a 360 s/km (6:00) -> 720 seg
      // Total: 12 km em 3720 seg -> Pace ponderado: 3720 / 12 = 310 s/km (5:10)
      // Média aritmética simples seria (300 + 360) / 2 = 330 s/km (5:30), o que seria distorcido!
      const items = [
        { distanceKm: 10, paceSeconds: 300 },
        { distanceKm: 2, paceSeconds: 360 },
      ];

      const res = calculateWeightedAveragePace(items);
      expect(res.averagePaceSeconds).toBe(310);
      expect(res.averagePaceFormatted).toBe("5:10");
      expect(res.averageSpeedKmh).toBeCloseTo((12 * 3600) / 3720, 2);
    });
  });

  describe("getWeeklyVolume & getMonthlyVolume", () => {
    it("agrega volume semanal considerando treinos e TAF", () => {
      const t1 = baseTraining({
        sessionDate: "2026-10-05T08:00:00Z", // Segunda-feira
        distanceKm: 6.0,
      });
      const t2 = baseTraining({
        sessionDate: "2026-10-07T08:00:00Z", // Quarta-feira
        distanceKm: 4.0,
      });
      const taf1 = baseAttempt({
        testDate: "2026-10-09T08:00:00Z", // Sexta-feira
        distanceMeters: 2300, // 2.3 km
      });

      const weekly = getWeeklyVolume([t1, t2], [taf1]);
      expect(weekly).toHaveLength(1);
      expect(weekly[0].sessionsCount).toBe(3);
      expect(weekly[0].distanceKm).toBe(12.3);
      expect(weekly[0].weekLabel).toContain("05/10");
    });

    it("agrega volume mensal", () => {
      const t1 = baseTraining({ sessionDate: "2026-10-01", distanceKm: 5 });
      const t2 = baseTraining({ sessionDate: "2026-10-20", distanceKm: 7 });
      const t3 = baseTraining({ sessionDate: "2026-11-05", distanceKm: 10 });

      const monthly = getMonthlyVolume([t1, t2, t3], []);
      expect(monthly).toHaveLength(2);
      expect(monthly[0].monthKey).toBe("2026-10");
      expect(monthly[0].distanceKm).toBe(12);
      expect(monthly[1].monthKey).toBe("2026-11");
      expect(monthly[1].distanceKm).toBe(10);
    });
  });

  describe("getRecordEvolutionProgression (Gráfico E Step-Line)", () => {
    it("gera evolução acumulada do recorde histórico", () => {
      const a1 = baseAttempt({ testDate: "2026-10-01", distanceMeters: 2100 });
      const a2 = baseAttempt({ testDate: "2026-10-04", distanceMeters: 2050 }); // pior
      const a3 = baseAttempt({ testDate: "2026-10-08", distanceMeters: 2280 }); // novo recorde

      const progression = getRecordEvolutionProgression([a1, a2, a3], 720);
      expect(progression).toHaveLength(3);
      expect(progression[0].recordDistance).toBe(2100);
      expect(progression[0].isNewRecord).toBe(true);

      expect(progression[1].recordDistance).toBe(2100); // manteve o recorde de 2100
      expect(progression[1].isNewRecord).toBe(false);

      expect(progression[2].recordDistance).toBe(2280);
      expect(progression[2].isNewRecord).toBe(true);
    });
  });

  describe("calculatePeriodMetrics & comparePeriods", () => {
    it("filtra treinos no intervalo e calcula métricas completas", () => {
      const tInside1 = baseTraining({
        sessionDate: "2026-10-02T10:00:00Z",
        distanceKm: 5.0,
        durationSeconds: 1500,
        perceivedEffort: 6,
      });
      const tInside2 = baseTraining({
        sessionDate: "2026-10-04T10:00:00Z",
        distanceKm: 5.0,
        durationSeconds: 1500,
        perceivedEffort: 8,
      });
      const tOutside = baseTraining({
        sessionDate: "2026-10-15T10:00:00Z",
        distanceKm: 10.0,
      });

      const metrics = calculatePeriodMetrics({
        startDate: "2026-10-01T00:00:00Z",
        endDate: "2026-10-10T23:59:59Z",
        trainings: [tInside1, tInside2, tOutside],
        attempts: [],
      });

      expect(metrics.totalSessions).toBe(2);
      expect(metrics.totalDistanceKm).toBe(10.0);
      expect(metrics.averageRpe).toBe(7.0);
      expect(metrics.hasLowSampleWarning).toBe(true); // < 3 sessões
    });

    it("compara período A vs B com deltas e textos explicativos", () => {
      // Período A: 2 treinos, 10 km
      const p1_t1 = baseTraining({ sessionDate: "2026-09-02", distanceKm: 5, durationSeconds: 1800 });
      const p1_t2 = baseTraining({ sessionDate: "2026-09-05", distanceKm: 5, durationSeconds: 1800 });
      const p1_taf = baseAttempt({ testDate: "2026-09-08", distanceMeters: 2200, actualDurationSeconds: 720 });

      // Período B: 3 treinos, 15 km, ritmo mais rápido, melhor TAF
      const p2_t1 = baseTraining({ sessionDate: "2026-10-02", distanceKm: 6, durationSeconds: 1800 });
      const p2_t2 = baseTraining({ sessionDate: "2026-10-05", distanceKm: 6, durationSeconds: 1800 });
      const p2_taf = baseAttempt({ testDate: "2026-10-08", distanceMeters: 2350, actualDurationSeconds: 720 });

      const allTrainings = [p1_t1, p1_t2, p2_t1, p2_t2];
      const allAttempts = [p1_taf, p2_taf];

      const comparison = comparePeriods(
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        allTrainings,
        allAttempts
      );

      expect(comparison.deltaDistanceKm).toBeGreaterThan(0);
      expect(comparison.deltaTafDistanceMeters).toBe(150); // 2350 - 2200
      expect(comparison.summaryText).toContain("O volume aumentou");
      expect(comparison.summaryText).toContain("+150 metros");
    });

    it("trata períodos com volume idêntico e sem testes TAF", () => {
      const t1 = baseTraining({ sessionDate: "2026-09-02", distanceKm: 5, durationSeconds: 1800 });
      const t2 = baseTraining({ sessionDate: "2026-10-02", distanceKm: 5, durationSeconds: 1800 });

      const comp = comparePeriods(
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        [t1, t2],
        []
      );

      expect(comp.deltaDistanceKm).toBe(0);
      expect(comp.deltaTafDistanceMeters).toBeNull();
      expect(comp.summaryText).toContain("idêntico");
    });
  });
});
