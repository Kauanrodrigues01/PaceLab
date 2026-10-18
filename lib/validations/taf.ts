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

export const PullupTypeEnum = z.enum(["dinamica", "isometria"] as const, {
  message: "Tipo de barra fixa inválido (escolha entre dinâmica ou isometria).",
});

export const TafGoalInputSchema = z.object({
  institutionName: z
    .string()
    .trim()
    .max(100, "O nome do concurso não pode ultrapassar 100 caracteres")
    .nullable()
    .optional()
    .default("Edital Padrão"),
  minDistanceMeters: z.coerce
    .number()
    .int("A distância mínima deve ser um valor inteiro em metros")
    .min(500, "A distância mínima da prova deve ser de no mínimo 500 metros")
    .max(10000, "A distância mínima da prova não pode ultrapassar 10.000 metros")
    .optional()
    .default(2400),
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

  // Barra Fixa
  pullupType: PullupTypeEnum.nullable().optional().default("dinamica"),
  pullupMinReps: z.coerce
    .number()
    .int("O mínimo de repetições na barra deve ser inteiro")
    .min(0, "O mínimo de repetições na barra não pode ser negativo")
    .max(100, "O valor máximo na barra é 100 repetições")
    .nullable()
    .optional()
    .default(3),
  pullupTargetReps: z.coerce
    .number()
    .int("A meta de repetições na barra deve ser inteiro")
    .min(0, "A meta de repetições na barra não pode ser negativa")
    .max(100, "O valor máximo na barra é 100 repetições")
    .nullable()
    .optional()
    .default(5),
  pullupMinSeconds: z.coerce
    .number()
    .int("Os segundos mínimos na barra devem ser inteiros")
    .min(0, "Os segundos mínimos não podem ser negativos")
    .max(600, "O valor máximo de isometria é 600 segundos")
    .nullable()
    .optional(),
  pullupTargetSeconds: z.coerce
    .number()
    .int("Os segundos alvo na barra devem ser inteiros")
    .min(0, "Os segundos alvo não podem ser negativos")
    .max(600, "O valor máximo de isometria é 600 segundos")
    .nullable()
    .optional(),
  pullupDurationSeconds: z.coerce
    .number()
    .int("O tempo limite na barra deve ser em segundos")
    .min(0, "O tempo limite não pode ser negativo")
    .max(600, "O tempo limite máximo é de 600 segundos")
    .nullable()
    .optional(),

  // Flexão de Braço
  pushupMinReps: z.coerce
    .number()
    .int("O mínimo de flexões deve ser inteiro")
    .min(0, "O mínimo de flexões não pode ser negativo")
    .max(200, "O valor máximo de flexões é 200")
    .nullable()
    .optional()
    .default(20),
  pushupTargetReps: z.coerce
    .number()
    .int("A meta de flexões deve ser inteira")
    .min(0, "A meta de flexões não pode ser negativa")
    .max(200, "O valor máximo de flexões é 200")
    .nullable()
    .optional()
    .default(30),
  pushupDurationSeconds: z.coerce
    .number()
    .int("O tempo limite de flexões deve ser em segundos")
    .min(0, "O tempo limite não pode ser negativo")
    .max(600, "O tempo limite máximo é de 600 segundos")
    .nullable()
    .optional(),

  // Abdominal
  absMinReps: z.coerce
    .number()
    .int("O mínimo de abdominais deve ser inteiro")
    .min(0, "O mínimo de abdominais não pode ser negativo")
    .max(200, "O valor máximo de abdominais é 200")
    .nullable()
    .optional()
    .default(30),
  absTargetReps: z.coerce
    .number()
    .int("A meta de abdominais deve ser inteira")
    .min(0, "A meta de abdominais não pode ser negativa")
    .max(200, "O valor máximo de abdominais é 200")
    .nullable()
    .optional()
    .default(40),
  absDurationSeconds: z.coerce
    .number()
    .int("O tempo limite de abdominais deve ser em segundos")
    .min(0, "O tempo limite não pode ser negativo")
    .max(600, "O tempo limite máximo é de 600 segundos")
    .nullable()
    .optional(),
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
  activeCalories: z.coerce.number().positive("As calorias ativas devem ser maiores que zero").nullable().optional(),
  totalCalories: z.coerce.number().positive("As calorias totais devem ser maiores que zero").nullable().optional(),
  metValue: z.coerce.number().positive("O valor de MET deve ser maior que zero").nullable().optional(),
  calorieMethod: z.string().nullable().optional(),
  calorieSource: z.string().nullable().optional(),
  calorieMetadata: z.any().nullable().optional(),
});

export const UpdateTrainingSessionSchema = CreateTrainingSessionSchema.partial();

// ─── Perfil do Atleta (UserProfile) ──────────────────────────────────────────

export const UserProfileInputSchema = z.object({
  id: z.string().optional(),
  userId: z.string().nullable().optional(),
  name: z
    .string()
    .trim()
    .max(100, "O nome não pode ter mais de 100 caracteres")
    .nullable()
    .optional(),
  heightCm: z.coerce
    .number()
    .min(50, "A altura deve ser de pelo menos 50 cm")
    .max(260, "A altura não pode ultrapassar 260 cm")
    .nullable()
    .optional(),
  currentWeightKg: z.coerce
    .number()
    .min(30, "O peso corporal deve ser de no mínimo 30 kg")
    .max(250, "O peso corporal não pode ultrapassar 250 kg")
    .nullable()
    .optional(),
  birthDate: z
    .union([z.string(), z.date()])
    .nullable()
    .optional()
    .transform((val) => (val ? new Date(val).toISOString() : null)),
  gender: z.enum(["masculino", "feminino", "outro"]).nullable().optional(),
});

export const UpdateUserProfileSchema = UserProfileInputSchema.partial();

// ─── Histórico de Pesagens (WeightRecord) ────────────────────────────────────

export const CreateWeightRecordSchema = z.object({
  id: z.string().optional(),
  profileId: z.string().optional(),
  weightKg: z.coerce
    .number()
    .min(30, "O peso corporal informado deve ser de no mínimo 30 kg")
    .max(250, "O peso corporal informado não pode ultrapassar 250 kg"),
  recordedAt: z
    .union([z.string(), z.date()])
    .optional()
    .transform((val) => (val ? new Date(val).toISOString() : new Date().toISOString())),
  notes: z
    .string()
    .trim()
    .max(500, "As anotações não podem ter mais de 500 caracteres")
    .nullable()
    .optional(),
  source: z.string().optional().default("manual"),
});

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
export type UserProfileInput = z.infer<typeof UserProfileInputSchema>;
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;
export type CreateWeightRecordInput = z.infer<typeof CreateWeightRecordSchema>;
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>;
