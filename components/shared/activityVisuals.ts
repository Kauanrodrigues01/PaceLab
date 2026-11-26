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
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  ACTIVITY_META,
  ACTIVITY_TYPES,
  ActivityMeta,
  ActivityType,
  PACE_ACTIVITY_OPTIONS,
} from "@/lib/activity";

export { ACTIVITY_COLORS, ACTIVITY_LABELS, PACE_ACTIVITY_OPTIONS };

export interface ActivityVisualConfig extends ActivityMeta {
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
  borderClass: string;
}

const ACTIVITY_UI_STYLES: Record<
  ActivityType,
  Pick<ActivityVisualConfig, "icon" | "badgeClass" | "borderClass">
> = {
  rodagem_leve: {
    icon: Wind,
    badgeClass: "bg-cyan-950/40 text-cyan-300 border-cyan-500/30",
    borderClass: "border-l-cyan-400",
  },
  corrida_continua: {
    icon: Flame,
    badgeClass: "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30",
    borderClass: "border-l-[#B7F34A]",
  },
  tempo_run: {
    icon: Gauge,
    badgeClass: "bg-violet-950/40 text-violet-300 border-violet-500/30",
    borderClass: "border-l-violet-400",
  },
  corrida_intervalada: {
    icon: Zap,
    badgeClass: "bg-amber-950/40 text-amber-300 border-amber-500/30",
    borderClass: "border-l-amber-400",
  },
  longao: {
    icon: Compass,
    badgeClass: "bg-rose-950/40 text-rose-300 border-rose-500/30",
    borderClass: "border-l-rose-400",
  },
  caminhada: {
    icon: Footprints,
    badgeClass: "bg-emerald-950/40 text-emerald-300 border-emerald-500/30",
    borderClass: "border-l-emerald-400",
  },
};

export const ACTIVITY_CONFIG: Record<ActivityType, ActivityVisualConfig> = {
  rodagem_leve: { ...ACTIVITY_META.rodagem_leve, ...ACTIVITY_UI_STYLES.rodagem_leve },
  corrida_continua: {
    ...ACTIVITY_META.corrida_continua,
    ...ACTIVITY_UI_STYLES.corrida_continua,
  },
  tempo_run: { ...ACTIVITY_META.tempo_run, ...ACTIVITY_UI_STYLES.tempo_run },
  corrida_intervalada: {
    ...ACTIVITY_META.corrida_intervalada,
    ...ACTIVITY_UI_STYLES.corrida_intervalada,
  },
  longao: { ...ACTIVITY_META.longao, ...ACTIVITY_UI_STYLES.longao },
  caminhada: { ...ACTIVITY_META.caminhada, ...ACTIVITY_UI_STYLES.caminhada },
};

export const ACTIVITY_FORM_OPTIONS: ActivityVisualConfig[] = ACTIVITY_TYPES.map(
  (type) => ACTIVITY_CONFIG[type]
);
