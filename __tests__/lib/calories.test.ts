import { describe, it, expect } from "vitest";
import {
  getMetForSpeedAndActivity,
  calcCalories,
  estimateTrainingCalories,
  calcIntervalCalories,
  COMPENDIUM_REST_NODE,
} from "@/lib/math/calories";
import { IntervalSession } from "@/types";

describe("Motor Matemático de Calorias — Compêndio de 2024 (Fase 1)", () => {
  describe("getMetForSpeedAndActivity & Interpolação", () => {
    it("retorna MET de repouso estático quando a velocidade for zero ou muito baixa", () => {
      const rest = getMetForSpeedAndActivity("repouso", 0);
      expect(rest.met).toBe(COMPENDIUM_REST_NODE.met);
      expect(rest.code).toBe(COMPENDIUM_REST_NODE.code);

      const runZero = getMetForSpeedAndActivity("corrida_continua", 0.2);
      expect(runZero.met).toBe(1.3);
      expect(runZero.code).toBe("09040");
    });

    it("retorna nós oficiais exatos para caminhada em velocidades tabeladas", () => {
      const walkSlow = getMetForSpeedAndActivity("caminhada", 3.0);
      expect(walkSlow.met).toBe(2.0); // cód 17151
      expect(walkSlow.code).toBe("17151");

      const walkModerate = getMetForSpeedAndActivity("caminhada", 4.8);
      expect(walkModerate.met).toBe(3.5); // cód 17190
      expect(walkModerate.code).toBe("17190");

      const walkBrisk = getMetForSpeedAndActivity("caminhada", 5.6);
      expect(walkBrisk.met).toBe(4.3); // cód 17200
      expect(walkBrisk.code).toBe("17200");

      const walkVeryFast = getMetForSpeedAndActivity("caminhada", 6.4);
      expect(walkVeryFast.met).toBe(5.0); // cód 17220
      expect(walkVeryFast.code).toBe("17220");
    });

    it("interpola suavemente a caminhada entre duas velocidades conhecidas", () => {
      // Entre 4.0 km/h (MET 2.8) e 4.8 km/h (MET 3.5)
      // Exato no meio: 4.4 km/h -> (2.8 + 3.5) / 2 = 3.15
      const walkInterp = getMetForSpeedAndActivity("caminhada", 4.4);
      expect(walkInterp.met).toBeCloseTo(3.15, 1);
    });

    it("retorna nós oficiais exatos para corrida em velocidades tabeladas", () => {
      const run8kmh = getMetForSpeedAndActivity("corrida_continua", 8.0);
      expect(run8kmh.met).toBe(8.3); // cód 12030

      const run10_8kmh = getMetForSpeedAndActivity("corrida_continua", 10.8);
      expect(run10_8kmh.met).toBe(10.5); // cód 12060

      const run12_9kmh = getMetForSpeedAndActivity("corrida_continua", 12.9);
      expect(run12_9kmh.met).toBe(11.8); // cód 12090

      const run16_1kmh = getMetForSpeedAndActivity("corrida_continua", 16.1);
      expect(run16_1kmh.met).toBe(14.5); // cód 12120

      const runSprint = getMetForSpeedAndActivity("corrida_continua", 20.0);
      expect(runSprint.met).toBe(19.0); // teto do cód 12140
    });

    it("interpola linearmente a corrida entre duas velocidades adjacentes", () => {
      // Entre 11.3 km/h (MET 11.0) e 12.1 km/h (MET 11.5)
      // Velocidade 11.7 km/h está exatamente na metade:
      // MET esperado = 11.0 + 0.5 * (11.5 - 11.0) = 11.25
      const runInterp = getMetForSpeedAndActivity("corrida_continua", 11.7);
      expect(runInterp.met).toBeCloseTo(11.25, 2);
    });
  });

  describe("calcCalories (Equação Oficial ACSM / Compêndio 2024)", () => {
    it("calcula calorias totais e ativas para um atleta de 70 kg correndo por 60 min com MET 10.0", () => {
      // Fórmula:
      // Total = (MET * 3.5 * pesoKg * duracaoMin) / 200
      // Total = (10 * 3.5 * 70 * 60) / 200 = 735.0 kcal
      // Ativo = ((MET - 1) * 3.5 * pesoKg * duracaoMin) / 200
      // Ativo = (9 * 3.5 * 70 * 60) / 200 = 661.5 kcal
      const result = calcCalories({
        weightKg: 70,
        durationSeconds: 3600, // 60 min
        met: 10.0,
      });

      expect(result.totalCalories).toBe(735.0);
      expect(result.activeCalories).toBe(661.5);
      expect(result.activeCalories).toBeLessThan(result.totalCalories);
    });

    it("retorna calorias zero defensivamente se os parâmetros forem inválidos ou nulos", () => {
      expect(calcCalories({ weightKg: 0, durationSeconds: 1800, met: 8 }).totalCalories).toBe(0);
      expect(calcCalories({ weightKg: 70, durationSeconds: 0, met: 8 }).totalCalories).toBe(0);
      expect(calcCalories({ weightKg: -70, durationSeconds: 1800, met: 8 }).activeCalories).toBe(0);
      expect(calcCalories({ weightKg: 70, durationSeconds: 1800, met: 0 }).totalCalories).toBe(0);
    });
  });

  describe("estimateTrainingCalories (Sessão Contínua)", () => {
    it("estima calorias para uma corrida de 5 km em 30 min (10 km/h) para um corredor de 75 kg", () => {
      const res = estimateTrainingCalories({
        activityType: "corrida_continua",
        speedKmh: 10.0,
        durationSeconds: 1800, // 30 min
        weightKg: 75,
      });

      expect(res.weightUsedKg).toBe(75);
      expect(res.durationMinutes).toBe(30);
      expect(res.method).toBe("compendium_2024_met");
      expect(res.version).toBe("2024.1");
      expect(res.metValue).toBeGreaterThan(9.0);
      expect(res.totalCalories).toBeGreaterThan(350);
      expect(res.activeCalories).toBeGreaterThan(300);
      expect(res.activeCalories).toBeLessThan(res.totalCalories);
    });

    it("estima calorias para caminhada de 4 km em 48 min (5 km/h) para uma pessoa de 65 kg", () => {
      const res = estimateTrainingCalories({
        activityType: "caminhada",
        speedKmh: 5.0,
        durationSeconds: 2880, // 48 min
        weightKg: 65,
      });

      expect(res.metValue).toBeGreaterThanOrEqual(3.5);
      expect(res.metValue).toBeLessThanOrEqual(4.3);
      expect(res.activeCalories).toBeGreaterThan(0);
      expect(res.activeCalories).toBeLessThan(res.totalCalories);
    });
  });

  describe("calcIntervalCalories (Sessão Intervalada Segmentada)", () => {
    it("calcula individualmente o gasto de tiros e recuperações em uma sessão intervalada", () => {
      const mockSession: IntervalSession = {
        totalTimeSeconds: 1200, // 20 min
        totalDistanceKm: 3.0,
        averageSpeedKmh: 9.0,
        averagePaceSeconds: 400,
        averagePaceFormatted: "6:40",
        stages: [
          // Aquecimento: 5 min a 8 km/h
          {
            index: 1,
            type: "warmup",
            durationSeconds: 300,
            speedKmh: 8.0,
            distanceKm: 0.67,
            paceFormatted: "7:30",
          },
          // Tiro 1: 2 min a 15 km/h
          {
            index: 2,
            type: "run",
            durationSeconds: 120,
            speedKmh: 15.0,
            distanceKm: 0.5,
            paceFormatted: "4:00",
          },
          // Recuperação 1: 2 min a 5 km/h
          {
            index: 3,
            type: "walk",
            durationSeconds: 120,
            speedKmh: 5.0,
            distanceKm: 0.17,
            paceFormatted: "12:00",
          },
          // Desaquecimento: 5 min a 6 km/h (caminhada leve)
          {
            index: 4,
            type: "cooldown",
            durationSeconds: 300,
            speedKmh: 6.0,
            distanceKm: 0.5,
            paceFormatted: "10:00",
          },
        ],
      };

      const result = calcIntervalCalories(mockSession, 70);

      expect(result.isSegmented).toBe(true);
      expect(result.segments.length).toBe(4);

      // O tiro a 15 km/h deve ter MET muito maior do que a recuperação a 5 km/h
      const tiroStage = result.segments.find((s) => s.stageType === "run");
      const walkStage = result.segments.find((s) => s.stageType === "walk");

      expect(tiroStage).toBeDefined();
      expect(walkStage).toBeDefined();
      expect(tiroStage!.metValue).toBeGreaterThan(12.0);
      expect(walkStage!.metValue).toBeLessThanOrEqual(4.5);

      // A soma dos segmentos deve bater exatamente com o total da sessão
      const sumActive = Number(result.segments.reduce((acc, s) => acc + s.activeCalories, 0).toFixed(1));
      const sumTotal = Number(result.segments.reduce((acc, s) => acc + s.totalCalories, 0).toFixed(1));

      expect(result.activeCalories).toBeCloseTo(sumActive, 1);
      expect(result.totalCalories).toBeCloseTo(sumTotal, 1);
      expect(result.activeCalories).toBeLessThan(result.totalCalories);
    });

    it("retorna valores zerados defensivamente se a sessão não contiver etapas ou peso for inválido", () => {
      const emptySession: IntervalSession = {
        totalTimeSeconds: 0,
        totalDistanceKm: 0,
        averageSpeedKmh: 0,
        averagePaceSeconds: 0,
        averagePaceFormatted: "--:--",
        stages: [],
      };

      const res = calcIntervalCalories(emptySession, 70);
      expect(res.totalCalories).toBe(0);
      expect(res.activeCalories).toBe(0);
      expect(res.segments).toEqual([]);

      const zeroWeight = calcIntervalCalories(emptySession, 0);
      expect(zeroWeight.totalCalories).toBe(0);
    });
  });
});
