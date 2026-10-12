import { z } from "zod";

// ─── Enums & Sub-schemas ───────────────────────────────────────────────────────

export const ActivityTypeEnum = z.enum(
  ["corrida_continua", "corrida_intervalada", "caminhada"] as const,
  {
    message: "Modalidade de treino inválida. Escolha entre Corrida Contínua, Intervalado ou Caminhada.",
  }
);

export const LocationTypeEnum = z.enum(
  ["pista_400m", "rua_plana", "parque_praca", "esteira", "outro"] as const,
  {
    message: "Local do teste inválido.",
  }
);

export const LapDetailSchema = z.object({
  lapNumber: z.coerce
    .number()
    .int("O número da volta deve ser um número inteiro")
    .min(1, "O número da volta deve ser pelo menos 1"),
  durationSeconds: z.coerce
    .number()
    .int("A duração da volta deve ser em segundos inteiros")
    .positive("A duração da volta deve ser maior que zero"),
  distanceMeters: z.coerce
    .number()
    .positive("A distância da volta deve ser maior que zero"),
  paceFormatted: z.string().optional(),
});

export const SplitDetailSchema = z.object({
  kilometer: z.coerce
    .number()
    .int("O quilômetro deve ser um número inteiro")
    .min(1, "O quilômetro deve ser pelo menos 1"),
  durationSeconds: z.coerce
    .number()
    .int("A duração da parcial deve ser em segundos inteiros")
    .positive("A duração da parcial deve ser maior que zero"),
  paceFormatted: z.string().optional(),
});

// ─── Metas do TAF (TafGoal) ────────────────────────────────────────────────────

export const TafGoalInputSchema = z.object({
  targetDistanceMeters: z.coerce
    .number()
    .int("A distância alvo deve ser um valor inteiro em metros")
    .min(500, "A distância alvo da prova deve ser de no mínimo 500 metros")
    .max(10000, "A distância alvo da prova não pode ultrapassar 10.000 metros")
    .default(2300),
  targetDurationMinutes: z.coerce
    .number()
    .int("A duração da prova deve ser em minutos inteiros")
    .min(1, "A duração da prova deve ser de pelo menos 1 minuto")
    .max(60, "A duração da prova não pode ultrapassar 60 minutos")
    .default(12),
  targetExamDate: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const TafGoalUpdateSchema = TafGoalInputSchema.partial();

// ─── Simulados do TAF (TafAttempt) ─────────────────────────────────────────────

export const CreateTafAttemptSchema = z.object({
  id: z.string().optional(),
  userId: z.string().nullable().optional(),
  testDate: z
    .union([z.string(), z.date()])
    .optional()
    .transform((val) => (val ? new Date(val).toISOString() : new Date().toISOString())),
  targetDurationSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(720),
  actualDurationSeconds: z.coerce
    .number()
    .int("A duração do teste deve ser um número inteiro de segundos")
    .min(30, "A duração do simulado deve ser de pelo menos 30 segundos")
    .max(7200, "A duração do simulado não pode exceder 2 horas (7.200s)"),
  distanceMeters: z.coerce
    .number()
    .int("A distância percorrida deve ser um número inteiro de metros")
    .min(100, "A distância percorrida deve ser de pelo menos 100 metros")
    .max(10000, "A distância percorrida não pode ultrapassar 10.000 metros"),
  speedKmh: z.coerce.number().positive().optional(),
  paceSeconds: z.coerce.number().int().positive().optional(),
  paceFormatted: z.string().optional(),
  locationType: LocationTypeEnum.nullable().optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "As observações não podem ter mais de 1.000 caracteres")
    .nullable()
    .optional(),
  laps: z.array(LapDetailSchema).optional().default([]),
});

export const UpdateTafAttemptSchema = CreateTafAttemptSchema.partial();

// ─── Diário de Treinos (TrainingSession) ────────────────────────────────────────

export const CreateTrainingSessionSchema = z.object({
  id: z.string().optional(),
  userId: z.string().nullable().optional(),
  sessionDate: z
    .union([z.string(), z.date()])
    .optional()
    .transform((val) => (val ? new Date(val).toISOString() : new Date().toISOString())),
  activityType: ActivityTypeEnum.default("corrida_continua"),
  distanceKm: z.coerce
    .number()
    .min(0.05, "A distância do treino deve ser de pelo menos 0,05 km (50m)")
    .max(100, "A distância máxima permitida por sessão é de 100 km"),
  durationSeconds: z.coerce
    .number()
    .int("A duração do treino deve ser em segundos inteiros")
    .min(30, "A duração do treino deve ser de pelo menos 30 segundos")
    .max(86400, "A duração máxima de um treino é de 24 horas"),
  speedKmh: z.coerce.number().positive().optional(),
  paceSeconds: z.coerce.number().int().positive().optional(),
  paceFormatted: z.string().optional(),
  perceivedEffort: z.coerce
    .number()
    .int("O esforço percebido (RPE) deve ser um número inteiro")
    .min(1, "O RPE mínimo é 1 (muito leve)")
    .max(10, "O RPE máximo é 10 (esforço máximo)")
    .nullable()
    .optional(),
  bodyWeightKg: z.coerce
    .number()
    .min(30, "O peso corporal informado deve ser de no mínimo 30 kg")
    .max(250, "O peso corporal informado deve ser de no máximo 250 kg")
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "As anotações do treino não podem ter mais de 1.000 caracteres")
    .nullable()
    .optional(),
  splits: z.array(SplitDetailSchema).optional().default([]),
});

export const UpdateTrainingSessionSchema = CreateTrainingSessionSchema.partial();

// ─── Paginação e Filtros de Consulta ───────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int("O limite deve ser um número inteiro")
    .min(1, "O limite mínimo de registros por página é 1")
    .max(100, "O limite máximo de registros por página é 100")
    .default(50),
  cursor: z.string().trim().min(1).optional(),
  activityType: ActivityTypeEnum.optional(),
});

// ─── Formatador de Erros do Zod ───────────────────────────────────────────────

export interface FormattedZodError {
  field: string;
  message: string;
}

export function formatZodErrors(error: z.ZodError): FormattedZodError[] {
  return error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "payload";
    return {
      field,
      message: issue.message,
    };
  });
}

// ─── Tipos Inferidos ──────────────────────────────────────────────────────────

export type TafGoalInput = z.infer<typeof TafGoalInputSchema>;
export type CreateTafAttemptInput = z.infer<typeof CreateTafAttemptSchema>;
export type UpdateTafAttemptInput = z.infer<typeof UpdateTafAttemptSchema>;
export type CreateTrainingSessionInput = z.infer<typeof CreateTrainingSessionSchema>;
export type UpdateTrainingSessionInput = z.infer<typeof UpdateTrainingSessionSchema>;
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>;
