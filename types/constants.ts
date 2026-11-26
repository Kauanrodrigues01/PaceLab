// Fonte única de verdade para enums, tuples e rótulos compartilhados entre
// tipagem (`types/`), validação (`lib/validations/`), OpenAPI e UI.

export const ACTIVITY_TYPES = [
  "rodagem_leve",
  "corrida_continua",
  "tempo_run",
  "corrida_intervalada",
  "longao",
  "caminhada",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_SOURCES = [
  "manual",
  "gpx_upload",
  "fit_upload",
  "sheets",
] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const LOCATION_TYPES = [
  "pista_400m",
  "rua_plana",
  "parque_praca",
  "esteira",
  "outro",
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export const ATHLETE_GENDERS = ["masculino", "feminino", "outro"] as const;

export type AthleteGender = (typeof ATHLETE_GENDERS)[number];

export const WEIGHT_SOURCES = [
  "manual",
  "weekly_prompt",
  "profile_update",
] as const;

export type WeightSource = (typeof WEIGHT_SOURCES)[number];

export const PULLUP_TYPES = ["dinamica", "isometria"] as const;

export type PullupType = (typeof PULLUP_TYPES)[number];

export const DUPLICATE_POLICIES = ["error", "update"] as const;

export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

export const SHEETS_SYNC_DIRECTIONS = [
  "bidirectional",
  "push",
  "pull",
] as const;

export type SheetsSyncDirection = (typeof SHEETS_SYNC_DIRECTIONS)[number];

export const WEEKLY_PLAN_STATUSES = [
  "Planejado",
  "Concluído",
  "Adaptado",
  "Parcial",
  "Perdido",
] as const;

export type WeeklyPlanStatus = (typeof WEEKLY_PLAN_STATUSES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  rodagem_leve: "Rodagem Leve",
  corrida_continua: "Corrida Contínua",
  tempo_run: "Tempo Run / Ritmo",
  corrida_intervalada: "Intervalado / Tiros",
  longao: "Longão",
  caminhada: "Caminhada",
};

export const SOURCE_LABELS: Record<ActivitySource, string> = {
  manual: "Manual",
  gpx_upload: "Strava GPX",
  fit_upload: "Strava FIT",
  sheets: "Google Sheets",
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  pista_400m: "Pista de Atletismo (400m)",
  rua_plana: "Rua Plana",
  parque_praca: "Parque / Praça",
  esteira: "Esteira",
  outro: "Outro Percurso",
};
