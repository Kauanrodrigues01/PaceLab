import { z } from "zod";
import {
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  ATHLETE_GENDERS,
  DUPLICATE_POLICIES,
  LOCATION_TYPES,
  PULLUP_TYPES,
  SHEETS_SYNC_DIRECTIONS,
  WEIGHT_SOURCES,
} from "@/types/constants";

// ─── Helpers & Sub-schemas Compartilhados ───────────────────────────────────────

export const PathIdSchema = z
  .string()
  .trim()
  .min(1, "Identificador inválido")
  .max(128, "Identificador inválido");

const OptionalTrimmedIdSchema = z
  .string()
  .trim()
  .max(128, "Identificador inválido")
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined));

function isValidCalendarDateString(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidDateInput(val: string | Date): boolean {
  if (val instanceof Date) {
    return !Number.isNaN(val.getTime());
  }
  const trimmed = val.trim();
  if (!trimmed) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidCalendarDateString(trimmed);
  }
  const parsed = new Date(trimmed);
  return !Number.isNaN(parsed.getTime());
}

const SyncedToSheetsAtSchema = z
  .union([z.string(), z.date()])
  .nullable()
  .optional()
  .refine(
    (val) => {
      if (val === undefined || val === null || val === "") return true;
      return isValidDateInput(val);
    },
    { message: "Data de sincronização inválida" }
  )
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    return (val instanceof Date ? val : new Date(val)).toISOString();
  });

function createDefaultIsoDateSchema(errorMessage: string) {
  return z
    .union([z.string(), z.date()])
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        if (typeof val === "string" && val.trim() === "") return true;
        return isValidDateInput(val);
      },
      { message: errorMessage }
    )
    .transform((val) => {
      if (!val || (typeof val === "string" && val.trim() === "")) {
        return new Date().toISOString();
      }
      return (val instanceof Date ? val : new Date(val.trim())).toISOString();
    });
}

function createStrictIsoDateSchema(errorMessage: string) {
  return z
    .union([z.string(), z.date()])
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        if (typeof val === "string" && val.trim() === "") return false;
        return isValidDateInput(val);
      },
      { message: errorMessage }
    )
    .transform((val) => {
      if (val === undefined) return undefined;
      return (val instanceof Date ? val : new Date(val.trim())).toISOString();
    });
}

export const ActivityTypeEnum = z.enum(ACTIVITY_TYPES, {
  message:
    "Modalidade de treino inválida. Escolha entre Rodagem Leve, Corrida Contínua, Tempo Run, Intervalado, Longão ou Caminhada.",
});

export const ActivitySourceEnum = z.enum(ACTIVITY_SOURCES, {
  message:
    "Origem de registro inválida. Escolha entre manual, gpx_upload, fit_upload ou sheets.",
});

export const DuplicatePolicyEnum = z.enum(DUPLICATE_POLICIES, {
  message: "Política de duplicidade inválida. Use error ou update.",
});

export const LocationTypeEnum = z.enum(LOCATION_TYPES, {
  message: "Local do teste inválido.",
});

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
  distanceKm: z.coerce
    .number()
    .gt(0, "A distância da parcial deve ser maior que zero")
    .max(1, "A distância da parcial não pode exceder 1 km")
    .optional(),
  paceSeconds: z.coerce
    .number()
    .int("O pace em segundos da parcial deve ser inteiro")
    .positive("O pace em segundos da parcial deve ser maior que zero")
    .optional(),
  avgHeartRate: z.coerce
    .number()
    .int("A frequência cardíaca média da parcial deve ser inteira")
    .min(30, "A FC média da parcial deve ser de no mínimo 30 bpm")
    .max(250, "A FC média da parcial deve ser de no máximo 250 bpm")
    .nullable()
    .optional(),
  elevationDiffM: z.coerce
    .number()
    .min(-1000, "A variação de elevação da parcial não pode ser menor que -1.000m")
    .max(1000, "A variação de elevação da parcial não pode exceder 1.000m")
    .nullable()
    .optional(),
});

// ─── Metas do TAF (TafGoal) ────────────────────────────────────────────────────

export const PullupTypeEnum = z.enum(PULLUP_TYPES, {
  message: "Tipo de barra fixa inválido (escolha entre dinâmica ou isometria).",
});

const TafGoalFieldsBase = {
  institutionName: z
    .string()
    .trim()
    .max(100, "O nome do concurso não pode ultrapassar 100 caracteres")
    .nullable()
    .optional(),
  minDistanceMeters: z.coerce
    .number()
    .int("A distância mínima deve ser um valor inteiro em metros")
    .min(500, "A distância mínima da prova deve ser de no mínimo 500 metros")
    .max(10000, "A distância mínima da prova não pode ultrapassar 10.000 metros")
    .optional(),
  targetDistanceMeters: z.coerce
    .number()
    .int("A distância alvo deve ser um valor inteiro em metros")
    .min(500, "A distância alvo da prova deve ser de no mínimo 500 metros")
    .max(10000, "A distância alvo da prova não pode ultrapassar 10.000 metros"),
  targetDurationMinutes: z.coerce
    .number()
    .int("A duração da prova deve ser em minutos inteiros")
    .min(1, "A duração da prova deve ser de pelo menos 1 minuto")
    .max(60, "A duração da prova não pode ultrapassar 60 minutos"),
  targetExamDate: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (val) => val === undefined || val === null || val === "" || isValidDateInput(val),
      { message: "Data do edital/prova inválida" }
    )
    .transform((val) => (val && val.length > 0 ? val : null)),

  // Barra Fixa
  pullupType: PullupTypeEnum.nullable().optional(),
  pullupMinReps: z.coerce
    .number()
    .int("O mínimo de repetições na barra deve ser inteiro")
    .min(0, "O mínimo de repetições na barra não pode ser negativo")
    .max(100, "O valor máximo na barra é 100 repetições")
    .nullable()
    .optional(),
  pullupTargetReps: z.coerce
    .number()
    .int("A meta de repetições na barra deve ser inteiro")
    .min(0, "A meta de repetições na barra não pode ser negativa")
    .max(100, "O valor máximo na barra é 100 repetições")
    .nullable()
    .optional(),
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
    .optional(),
  pushupTargetReps: z.coerce
    .number()
    .int("A meta de flexões deve ser inteira")
    .min(0, "A meta de flexões não pode ser negativa")
    .max(200, "O valor máximo de flexões é 200")
    .nullable()
    .optional(),
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
    .optional(),
  absTargetReps: z.coerce
    .number()
    .int("A meta de abdominais deve ser inteira")
    .min(0, "A meta de abdominais não pode ser negativa")
    .max(200, "O valor máximo de abdominais é 200")
    .nullable()
    .optional(),
  absDurationSeconds: z.coerce
    .number()
    .int("O tempo limite de abdominais deve ser em segundos")
    .min(0, "O tempo limite não pode ser negativo")
    .max(600, "O tempo limite máximo é de 600 segundos")
    .nullable()
    .optional(),
};

export const TafGoalInputSchema = z.object({
  ...TafGoalFieldsBase,
  institutionName: TafGoalFieldsBase.institutionName.default("Edital Padrão"),
  minDistanceMeters: TafGoalFieldsBase.minDistanceMeters.default(2400),
  targetDistanceMeters: TafGoalFieldsBase.targetDistanceMeters.default(2300),
  targetDurationMinutes: TafGoalFieldsBase.targetDurationMinutes.default(12),
  pullupType: TafGoalFieldsBase.pullupType.default("dinamica"),
  pullupMinReps: TafGoalFieldsBase.pullupMinReps.default(3),
  pullupTargetReps: TafGoalFieldsBase.pullupTargetReps.default(5),
  pushupMinReps: TafGoalFieldsBase.pushupMinReps.default(20),
  pushupTargetReps: TafGoalFieldsBase.pushupTargetReps.default(30),
  absMinReps: TafGoalFieldsBase.absMinReps.default(30),
  absTargetReps: TafGoalFieldsBase.absTargetReps.default(40),
});

export const TafGoalUpdateSchema = z.object(TafGoalFieldsBase).partial();

// ─── Campos Compartilhados (TafAttempt & TrainingSession) ─────────────────────

const ExternalTrackingFields = {
  userId: z.string().nullable().optional(),
  source: ActivitySourceEnum.optional().default("manual"),
  externalId: z
    .string()
    .trim()
    .min(1, "O identificador externo não pode ser vazio")
    .max(100, "O identificador externo não pode exceder 100 caracteres")
    .nullable()
    .optional(),
  syncedToSheetsAt: SyncedToSheetsAtSchema,
  onDuplicate: DuplicatePolicyEnum.optional(),
};

const ComputedPaceFields = {
  speedKmh: z.coerce.number().positive().optional(),
  paceSeconds: z.coerce.number().int().positive().optional(),
  paceFormatted: z.string().optional(),
};

const ShoeNameField = z
  .string()
  .trim()
  .max(100, "O nome do tênis não pode ter mais de 100 caracteres")
  .nullable()
  .optional()
  .transform((val) => (val === "" ? null : val));

const HeartRateFields = {
  avgHeartRate: z.coerce
    .number()
    .int("A frequência cardíaca média deve ser um número inteiro")
    .min(30, "A frequência cardíaca média mínima é 30 bpm")
    .max(250, "A frequência cardíaca média máxima é 250 bpm")
    .nullable()
    .optional(),
  maxHeartRate: z.coerce
    .number()
    .int("A frequência cardíaca máxima deve ser um número inteiro")
    .min(30, "A frequência cardíaca máxima mínima é 30 bpm")
    .max(250, "A frequência cardíaca máxima máxima é 250 bpm")
    .nullable()
    .optional(),
};

// ─── Simulados do TAF (TafAttempt) ─────────────────────────────────────────────

const TafAttemptTargetDurationSchema = z.coerce
  .number()
  .int()
  .positive();

const CreateTafAttemptBaseSchema = z.object({
  id: OptionalTrimmedIdSchema,
  ...ExternalTrackingFields,
  testDate: createDefaultIsoDateSchema("Data do simulado inválida"),
  targetDurationSeconds: TafAttemptTargetDurationSchema.default(720),
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
  ...ComputedPaceFields,
  locationType: LocationTypeEnum.nullable().optional(),
  shoeName: ShoeNameField,
  ...HeartRateFields,
  notes: z
    .string()
    .trim()
    .max(1000, "As observações não podem ter mais de 1.000 caracteres")
    .nullable()
    .optional(),
  laps: z.array(LapDetailSchema).optional().default([]),
});

function validateHeartRateRefinement(
  val: { avgHeartRate?: number | null; maxHeartRate?: number | null },
  ctx: z.RefinementCtx
) {
  if (
    typeof val.avgHeartRate === "number" &&
    typeof val.maxHeartRate === "number" &&
    val.maxHeartRate < val.avgHeartRate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxHeartRate"],
      message: "A frequência cardíaca máxima não pode ser menor que a frequência cardíaca média",
    });
  }
}

export const CreateTafAttemptSchema = CreateTafAttemptBaseSchema.superRefine(
  validateHeartRateRefinement
);

export const UpdateTafAttemptSchema = CreateTafAttemptBaseSchema.omit({
  source: true,
  externalId: true,
  onDuplicate: true,
})
  .extend({
    testDate: createStrictIsoDateSchema("Data do simulado inválida"),
    targetDurationSeconds: TafAttemptTargetDurationSchema.optional(),
    laps: z.array(LapDetailSchema).optional(),
  })
  .partial()
  .superRefine(validateHeartRateRefinement);

// ─── Diário de Treinos (TrainingSession) ────────────────────────────────────────

const CreateTrainingSessionBaseSchema = z.object({
  id: OptionalTrimmedIdSchema,
  ...ExternalTrackingFields,
  sessionDate: createDefaultIsoDateSchema("Data da sessão inválida"),
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
  elapsedSeconds: z.coerce
    .number()
    .int("O tempo decorrido deve ser em segundos inteiros")
    .min(30, "O tempo decorrido deve ser de pelo menos 30 segundos")
    .max(86400, "O tempo decorrido máximo de um treino é de 24 horas")
    .nullable()
    .optional(),
  ...ComputedPaceFields,
  ...HeartRateFields,
  elevationGainM: z.coerce
    .number()
    .min(0, "O ganho de elevação não pode ser negativo")
    .max(10000, "O ganho de elevação máximo permitido é de 10.000 metros")
    .nullable()
    .optional(),
  avgCadence: z.coerce
    .number()
    .int("A cadência média deve ser um número inteiro")
    .min(30, "A cadência média mínima é 30 spm")
    .max(300, "A cadência média máxima é 300 spm")
    .nullable()
    .optional(),
  shoeName: ShoeNameField,
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

function validateTrainingSessionRefinements(
  val: {
    durationSeconds?: number;
    elapsedSeconds?: number | null;
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
  },
  ctx: z.RefinementCtx
) {
  if (
    typeof val.durationSeconds === "number" &&
    typeof val.elapsedSeconds === "number" &&
    val.elapsedSeconds < val.durationSeconds
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["elapsedSeconds"],
      message: "O tempo decorrido total não pode ser menor que o tempo em movimento",
    });
  }
  validateHeartRateRefinement(val, ctx);
}

export const CreateTrainingSessionSchema = CreateTrainingSessionBaseSchema.superRefine(
  validateTrainingSessionRefinements
);

export const UpdateTrainingSessionSchema = CreateTrainingSessionBaseSchema.omit({
  source: true,
  externalId: true,
  onDuplicate: true,
})
  .extend({
    sessionDate: createStrictIsoDateSchema("Data da sessão inválida"),
    activityType: ActivityTypeEnum.optional(),
    splits: z.array(SplitDetailSchema).optional(),
  })
  .partial()
  .superRefine(validateTrainingSessionRefinements);

// ─── Perfil do Atleta (UserProfile) ──────────────────────────────────────────

export const UserProfileInputSchema = z.object({
  id: OptionalTrimmedIdSchema,
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
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        return isValidDateInput(val);
      },
      { message: "Data de nascimento inválida" }
    )
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return null;
      return (val instanceof Date ? val : new Date(val)).toISOString();
    }),
  gender: z.enum(ATHLETE_GENDERS).nullable().optional(),
});

export const UpdateUserProfileSchema = UserProfileInputSchema.partial();

// ─── Histórico de Pesagens (WeightRecord) ────────────────────────────────────

export const CreateWeightRecordSchema = z.object({
  id: OptionalTrimmedIdSchema,
  profileId: z.string().optional(),
  weightKg: z.coerce
    .number()
    .min(30, "O peso corporal informado deve ser de no mínimo 30 kg")
    .max(250, "O peso corporal informado não pode ultrapassar 250 kg"),
  recordedAt: createDefaultIsoDateSchema("Data da pesagem inválida"),
  notes: z
    .string()
    .trim()
    .max(500, "As anotações não podem ter mais de 500 caracteres")
    .nullable()
    .optional(),
  source: z.enum(WEIGHT_SOURCES).optional().default("manual"),
});

export const WeightListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int("O limite deve ser um número inteiro")
    .min(1, "O limite mínimo de registros é 1")
    .max(365, "O limite máximo de registros é 365")
    .default(52),
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

export const WeeklyPlanQuerySchema = z.object({
  weekStart: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart deve estar no formato YYYY-MM-DD")
    .refine(
      isValidCalendarDateString,
      "weekStart deve representar uma data real válida no calendário"
    )
    .optional(),
});

// ─── Sincronização Google Sheets ───────────────────────────────────────────────

export const SheetsSyncDirectionEnum = z.enum(SHEETS_SYNC_DIRECTIONS, {
  message:
    "Direção de sincronização inválida. Escolha entre bidirectional, push ou pull.",
});

export const SheetsSyncRequestSchema = z
  .object({
    direction: SheetsSyncDirectionEnum.optional().default("bidirectional"),
    forceFullResync: z.boolean().optional().default(false),
  })
  .default({
    direction: "bidirectional",
    forceFullResync: false,
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

// ─── Tipos Inferidos (Entrada & Saída Parseada) ───────────────────────────────

export type TafGoalInput = z.input<typeof TafGoalInputSchema>;
export type TafGoalUpdateInput = z.input<typeof TafGoalUpdateSchema>;
export type CreateTafAttemptInput = z.input<typeof CreateTafAttemptSchema>;
export type UpdateTafAttemptInput = z.input<typeof UpdateTafAttemptSchema>;
export type CreateTrainingSessionInput = z.input<typeof CreateTrainingSessionSchema>;
export type UpdateTrainingSessionInput = z.input<typeof UpdateTrainingSessionSchema>;
export type UserProfileInput = z.input<typeof UserProfileInputSchema>;
export type UpdateUserProfileInput = z.input<typeof UpdateUserProfileSchema>;
export type CreateWeightRecordInput = z.input<typeof CreateWeightRecordSchema>;
export type WeightListQueryInput = z.infer<typeof WeightListQuerySchema>;
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>;
export type SheetsSyncRequestInput = z.infer<typeof SheetsSyncRequestSchema>;
export type WeeklyPlanQueryInput = z.infer<typeof WeeklyPlanQuerySchema>;
