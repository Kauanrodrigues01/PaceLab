import React from "react";
import {
  Flame,
  Zap,
  Footprints,
  Wind,
  Gauge,
  Compass,
} from "lucide-react";
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

export interface ActivityVisualConfig {
  type: ActivityType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
  borderClass: string;
  color: string;
  family: "run" | "walk";
}

export const ACTIVITY_CONFIG: Record<ActivityType, ActivityVisualConfig> = {
  rodagem_leve: {
    type: "rodagem_leve",
    label: ACTIVITY_LABELS.rodagem_leve,
    shortLabel: "Rodagem Leve",
    icon: Wind,
    badgeClass: "bg-cyan-950/40 text-cyan-300 border-cyan-500/30",
    borderClass: "border-l-cyan-400",
    color: "#22d3ee",
    family: "run",
  },
  corrida_continua: {
    type: "corrida_continua",
    label: ACTIVITY_LABELS.corrida_continua,
    shortLabel: "Corrida Contínua",
    icon: Flame,
    badgeClass: "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30",
    borderClass: "border-l-[#B7F34A]",
    color: "#3b82f6",
    family: "run",
  },
  tempo_run: {
    type: "tempo_run",
    label: ACTIVITY_LABELS.tempo_run,
    shortLabel: "Tempo Run",
    icon: Gauge,
    badgeClass: "bg-violet-950/40 text-violet-300 border-violet-500/30",
    borderClass: "border-l-violet-400",
    color: "#a855f7",
    family: "run",
  },
  corrida_intervalada: {
    type: "corrida_intervalada",
    label: ACTIVITY_LABELS.corrida_intervalada,
    shortLabel: "Intervalado",
    icon: Zap,
    badgeClass: "bg-amber-950/40 text-amber-300 border-amber-500/30",
    borderClass: "border-l-amber-400",
    color: "#f59e0b",
    family: "run",
  },
  longao: {
    type: "longao",
    label: ACTIVITY_LABELS.longao,
    shortLabel: "Longão",
    icon: Compass,
    badgeClass: "bg-rose-950/40 text-rose-300 border-rose-500/30",
    borderClass: "border-l-rose-400",
    color: "#f43f5e",
    family: "run",
  },
  caminhada: {
    type: "caminhada",
    label: ACTIVITY_LABELS.caminhada,
    shortLabel: "Caminhada",
    icon: Footprints,
    badgeClass: "bg-emerald-950/40 text-emerald-300 border-emerald-500/30",
    borderClass: "border-l-emerald-400",
    color: "#10b981",
    family: "walk",
  },
};

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  rodagem_leve: ACTIVITY_CONFIG.rodagem_leve.color,
  corrida_continua: ACTIVITY_CONFIG.corrida_continua.color,
  tempo_run: ACTIVITY_CONFIG.tempo_run.color,
  corrida_intervalada: ACTIVITY_CONFIG.corrida_intervalada.color,
  longao: ACTIVITY_CONFIG.longao.color,
  caminhada: ACTIVITY_CONFIG.caminhada.color,
};

export const ACTIVITY_FORM_OPTIONS: ActivityVisualConfig[] = ACTIVITY_TYPES.map(
  (type) => ACTIVITY_CONFIG[type]
);

export const PACE_ACTIVITY_OPTIONS: Array<{
  value: "all" | ActivityType;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  ...ACTIVITY_TYPES.map((type) => ({
    value: type,
    label: ACTIVITY_CONFIG[type].shortLabel,
  })),
];
