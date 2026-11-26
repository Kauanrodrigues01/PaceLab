import {
  ActivityType,
  ACTIVITY_TYPES,
  ACTIVITY_LABELS,
  ActivitySource,
  ACTIVITY_SOURCES,
  SOURCE_LABELS,
} from "@/types";

export {
  ACTIVITY_TYPES,
  ACTIVITY_LABELS,
  ACTIVITY_SOURCES,
  SOURCE_LABELS,
};
export type { ActivityType, ActivitySource };

export interface ActivityMeta {
  type: ActivityType;
  label: string;
  shortLabel: string;
  color: string;
  family: "run" | "walk";
}

export const ACTIVITY_META: Record<ActivityType, ActivityMeta> = {
  rodagem_leve: {
    type: "rodagem_leve",
    label: ACTIVITY_LABELS.rodagem_leve,
    shortLabel: "Rodagem Leve",
    color: "#22d3ee",
    family: "run",
  },
  corrida_continua: {
    type: "corrida_continua",
    label: ACTIVITY_LABELS.corrida_continua,
    shortLabel: "Corrida Contínua",
    color: "#3b82f6",
    family: "run",
  },
  tempo_run: {
    type: "tempo_run",
    label: ACTIVITY_LABELS.tempo_run,
    shortLabel: "Tempo Run",
    color: "#a855f7",
    family: "run",
  },
  corrida_intervalada: {
    type: "corrida_intervalada",
    label: ACTIVITY_LABELS.corrida_intervalada,
    shortLabel: "Intervalado",
    color: "#f59e0b",
    family: "run",
  },
  longao: {
    type: "longao",
    label: ACTIVITY_LABELS.longao,
    shortLabel: "Longão",
    color: "#f43f5e",
    family: "run",
  },
  caminhada: {
    type: "caminhada",
    label: ACTIVITY_LABELS.caminhada,
    shortLabel: "Caminhada",
    color: "#10b981",
    family: "walk",
  },
};

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  rodagem_leve: ACTIVITY_META.rodagem_leve.color,
  corrida_continua: ACTIVITY_META.corrida_continua.color,
  tempo_run: ACTIVITY_META.tempo_run.color,
  corrida_intervalada: ACTIVITY_META.corrida_intervalada.color,
  longao: ACTIVITY_META.longao.color,
  caminhada: ACTIVITY_META.caminhada.color,
};

export const ACTIVITY_OPTIONS: ActivityMeta[] = ACTIVITY_TYPES.map(
  (type) => ACTIVITY_META[type]
);

export const PACE_ACTIVITY_OPTIONS: Array<{
  value: "all" | ActivityType;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  ...ACTIVITY_TYPES.map((type) => ({
    value: type,
    label: ACTIVITY_META[type].shortLabel,
  })),
];
