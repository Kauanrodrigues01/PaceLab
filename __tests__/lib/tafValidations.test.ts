import { describe, it, expect } from "vitest";
import {
  TafGoalInputSchema,
  CreateTafAttemptSchema,
  UpdateTafAttemptSchema,
  CreateTrainingSessionSchema,
  UpdateTrainingSessionSchema,
  PaginationQuerySchema,
  formatZodErrors,
} from "@/lib/validations/taf";

describe("Validações Zod do TAF (Fase 1 - Eixo B)", () => {
  describe("TafGoalInputSchema", () => {
    it("aplica valores padrão quando os campos são omitidos", () => {
      const parsed = TafGoalInputSchema.parse({});
      expect(parsed.targetDistanceMeters).toBe(2300);
      expect(parsed.targetDurationMinutes).toBe(12);
      expect(parsed.targetExamDate).toBeNull();
    });

    it("aceita valores personalizados válidos", () => {
      const parsed = TafGoalInputSchema.parse({
        targetDistanceMeters: "2400",
        targetDurationMinutes: "12",
        targetExamDate: "2026-12-15",
      });
      expect(parsed.targetDistanceMeters).toBe(2400);
      expect(parsed.targetDurationMinutes).toBe(12);
      expect(parsed.targetExamDate).toBe("2026-12-15");
    });

    it("rejeita distância alvo menor que 500m", () => {
      const result = TafGoalInputSchema.safeParse({ targetDistanceMeters: 450 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors[0].field).toBe("targetDistanceMeters");
        expect(errors[0].message).toContain("no mínimo 500 metros");
      }
    });

    it("rejeita distância alvo maior que 10.000m", () => {
      const result = TafGoalInputSchema.safeParse({ targetDistanceMeters: 10500 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors[0].message).toContain("não pode ultrapassar 10.000 metros");
      }
    });

    it("rejeita duração menor que 1 minuto ou maior que 60 minutos", () => {
      expect(TafGoalInputSchema.safeParse({ targetDurationMinutes: 0 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ targetDurationMinutes: 65 }).success).toBe(false);
    });

    it("valida campos multimodais completos com sucesso", () => {
      const parsed = TafGoalInputSchema.parse({
        institutionName: "Polícia Militar",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        pullupType: "dinamica",
        pullupMinReps: 4,
        pullupTargetReps: 7,
        pullupDurationSeconds: 60,
        pushupMinReps: 25,
        pushupTargetReps: 35,
        pushupDurationSeconds: 60,
        absMinReps: 35,
        absTargetReps: 45,
        absDurationSeconds: 60,
      });

      expect(parsed.institutionName).toBe("Polícia Militar");
      expect(parsed.minDistanceMeters).toBe(2400);
      expect(parsed.pullupType).toBe("dinamica");
      expect(parsed.pullupMinReps).toBe(4);
      expect(parsed.pullupDurationSeconds).toBe(60);
      expect(parsed.pushupMinReps).toBe(25);
      expect(parsed.pushupDurationSeconds).toBe(60);
      expect(parsed.absMinReps).toBe(35);
      expect(parsed.absDurationSeconds).toBe(60);
    });

    it("rejeita modalidade de barra inválida", () => {
      const result = TafGoalInputSchema.safeParse({
        pullupType: "invalido",
      });
      expect(result.success).toBe(false);
    });

    it("rejeita repetições negativas em exercícios complementares", () => {
      expect(TafGoalInputSchema.safeParse({ pullupMinReps: -1 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ pushupMinReps: -5 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ absMinReps: -10 }).success).toBe(false);
    });

    it("aceita null ou valores válidos de duração e rejeita tempos negativos em barra, flexão e abdominal", () => {
      const nullDurations = TafGoalInputSchema.parse({
        pullupDurationSeconds: null,
        pushupDurationSeconds: null,
        absDurationSeconds: null,
      });
      expect(nullDurations.pullupDurationSeconds).toBeNull();
      expect(nullDurations.pushupDurationSeconds).toBeNull();
      expect(nullDurations.absDurationSeconds).toBeNull();

      expect(TafGoalInputSchema.safeParse({ pullupDurationSeconds: -10 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ pushupDurationSeconds: -1 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ absDurationSeconds: -5 }).success).toBe(false);
      expect(TafGoalInputSchema.safeParse({ pullupDurationSeconds: 650 }).success).toBe(false);
    });
  });

  describe("CreateTafAttemptSchema", () => {
    it("valida e converte payload de simulado válido", () => {
      const payload = {
        distanceMeters: 2350,
        actualDurationSeconds: 720,
        speedKmh: 11.75,
        paceSeconds: 306,
        paceFormatted: "5:06",
        locationType: "pista_400m",
        notes: "Treino em ritmo forte",
        laps: [
          { lapNumber: 1, durationSeconds: 118, distanceMeters: 400 },
          { lapNumber: 2, durationSeconds: 122, distanceMeters: 400 },
        ],
      };

      const result = CreateTafAttemptSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.distanceMeters).toBe(2350);
        expect(result.data.actualDurationSeconds).toBe(720);
        expect(result.data.targetDurationSeconds).toBe(720);
        expect(result.data.laps).toHaveLength(2);
      }
    });

    it("rejeita simulado com distância menor que 100m", () => {
      const result = CreateTafAttemptSchema.safeParse({
        distanceMeters: 50,
        actualDurationSeconds: 720,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors[0].field).toBe("distanceMeters");
        expect(errors[0].message).toContain("pelo menos 100 metros");
      }
    });

    it("rejeita simulado com duração menor que 30s ou maior que 2h", () => {
      expect(
        CreateTafAttemptSchema.safeParse({ distanceMeters: 2000, actualDurationSeconds: 15 }).success
      ).toBe(false);
      expect(
        CreateTafAttemptSchema.safeParse({ distanceMeters: 2000, actualDurationSeconds: 8000 }).success
      ).toBe(false);
    });

    it("rejeita distância que não seja número inteiro de metros", () => {
      const result = CreateTafAttemptSchema.safeParse({
        distanceMeters: 2350.5,
        actualDurationSeconds: 720,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors[0].field).toBe("distanceMeters");
        expect(errors[0].message).toContain("número inteiro de metros");
      }
    });

    it("rejeita volta com número ou duração inválidos", () => {
      const result = CreateTafAttemptSchema.safeParse({
        distanceMeters: 2000,
        actualDurationSeconds: 720,
        laps: [{ lapNumber: 0, durationSeconds: -10, distanceMeters: 400 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateTrainingSessionSchema", () => {
    it("valida sessão de treino completa com splits e RPE", () => {
      const payload = {
        activityType: "corrida_intervalada",
        distanceKm: "5.5",
        durationSeconds: "1650",
        speedKmh: 12,
        paceSeconds: 300,
        paceFormatted: "5:00",
        perceivedEffort: 8,
        bodyWeightKg: 72.5,
        splits: [
          { kilometer: 1, durationSeconds: 300, paceFormatted: "5:00" },
          { kilometer: 2, durationSeconds: 295, paceFormatted: "4:55" },
        ],
      };

      const result = CreateTrainingSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activityType).toBe("corrida_intervalada");
        expect(result.data.distanceKm).toBe(5.5);
        expect(result.data.durationSeconds).toBe(1650);
        expect(result.data.perceivedEffort).toBe(8);
        expect(result.data.bodyWeightKg).toBe(72.5);
      }
    });

    it("permite registrar treino sem peso corporal e sem RPE (valores nulos)", () => {
      const result = CreateTrainingSessionSchema.safeParse({
        activityType: "corrida_continua",
        distanceKm: 10,
        durationSeconds: 3000,
        perceivedEffort: null,
        bodyWeightKg: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.perceivedEffort).toBeNull();
        expect(result.data.bodyWeightKg).toBeNull();
      }
    });

    it("rejeita modalidade de atividade desconhecida", () => {
      const result = CreateTrainingSessionSchema.safeParse({
        activityType: "futebol_society",
        distanceKm: 5,
        durationSeconds: 1500,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors[0].field).toBe("activityType");
        expect(errors[0].message).toContain("Modalidade de treino inválida");
      }
    });

    it("rejeita RPE fora da faixa de 1 a 10", () => {
      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          perceivedEffort: 0,
        }).success
      ).toBe(false);

      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          perceivedEffort: 11,
        }).success
      ).toBe(false);
    });

    it("rejeita peso corporal absurdo (< 30 kg ou > 250 kg)", () => {
      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          bodyWeightKg: 20,
        }).success
      ).toBe(false);

      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "corrida_continua",
          distanceKm: 5,
          durationSeconds: 1500,
          bodyWeightKg: 300,
        }).success
      ).toBe(false);
    });

    it("rejeita modalidades de treino fora do enum estrito (como 'teste_taf' e 'outro')", () => {
      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "teste_taf",
          distanceKm: 5,
          durationSeconds: 1500,
        }).success
      ).toBe(false);

      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "outro",
          distanceKm: 5,
          durationSeconds: 1500,
        }).success
      ).toBe(false);

      expect(
        CreateTrainingSessionSchema.safeParse({
          activityType: "ciclismo",
          distanceKm: 5,
          durationSeconds: 1500,
        }).success
      ).toBe(false);
    });
  });

  describe("LocationTypeEnum e CreateTafAttemptSchema", () => {
    it("rejeita locationType fora do enum estrito", () => {
      expect(
        CreateTafAttemptSchema.safeParse({
          distanceMeters: 2400,
          actualDurationSeconds: 720,
          locationType: "local_inexistente",
        }).success
      ).toBe(false);

      expect(
        CreateTafAttemptSchema.safeParse({
          distanceMeters: 2400,
          actualDurationSeconds: 720,
          locationType: "pista_400m",
        }).success
      ).toBe(true);
    });
  });

  describe("UpdateTafAttemptSchema e UpdateTrainingSessionSchema (Schemas Parciais)", () => {
    it("permite atualizar campos isolados de uma tentativa de TAF", () => {
      const partialAttempt = UpdateTafAttemptSchema.parse({
        notes: "Nova anotação de teste",
        locationType: "rua_plana",
      });
      expect(partialAttempt.notes).toBe("Nova anotação de teste");
      expect(partialAttempt.locationType).toBe("rua_plana");
      expect(partialAttempt.distanceMeters).toBeUndefined();
    });

    it("permite atualizar campos isolados de uma sessão de treino", () => {
      const partialTraining = UpdateTrainingSessionSchema.parse({
        perceivedEffort: 9,
        notes: "Treino ajustado pelo treinador",
      });
      expect(partialTraining.perceivedEffort).toBe(9);
      expect(partialTraining.notes).toBe("Treino ajustado pelo treinador");
      expect(partialTraining.distanceKm).toBeUndefined();
    });
  });

  describe("PaginationQuerySchema", () => {
    it("aplica limite padrão de 50 registros", () => {
      const parsed = PaginationQuerySchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.cursor).toBeUndefined();
    });

    it("rejeita limite menor que 1 ou maior que 100", () => {
      expect(PaginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(PaginationQuerySchema.safeParse({ limit: 150 }).success).toBe(false);
    });

    it("valida cursor e modalidade opcionais", () => {
      const parsed = PaginationQuerySchema.parse({
        limit: "25",
        cursor: "trn_123456",
        activityType: "caminhada",
      });
      expect(parsed.limit).toBe(25);
      expect(parsed.cursor).toBe("trn_123456");
      expect(parsed.activityType).toBe("caminhada");
    });
  });

  describe("formatZodErrors helper", () => {
    it("formata erros aninhados com notação de ponto e mensagens limpas", () => {
      const result = CreateTafAttemptSchema.safeParse({
        distanceMeters: -5,
        actualDurationSeconds: 10,
        laps: [{ lapNumber: -1, durationSeconds: -5, distanceMeters: -10 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = formatZodErrors(result.error);
        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted.some((e) => e.field === "distanceMeters")).toBe(true);
        expect(formatted.some((e) => e.field === "actualDurationSeconds")).toBe(true);
        expect(formatted.some((e) => e.field === "laps.0.lapNumber")).toBe(true);
      }
    });
  });
});
