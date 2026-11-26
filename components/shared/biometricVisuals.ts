import type { CooperClassificationLevel } from "@/lib/math/cooper";
import type { BmiCategory } from "@/lib/services/profileService";

/**
 * Estilização visual das categorias de IMC para componentes de UI.
 */
export const BMI_CATEGORY_COLORS: Record<BmiCategory, string> = {
  abaixo_do_peso: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  peso_normal: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  sobrepeso: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  obesidade: "text-rose-500 bg-rose-500/10 border-rose-500/30",
};

export interface CooperClassificationVisuals {
  colorClass: string;
  badgeBgClass: string;
}

/**
 * Estilização visual das classificações do Teste de Cooper (VO2 Máx) para componentes de UI.
 */
export const COOPER_CLASSIFICATION_VISUALS: Record<
  CooperClassificationLevel,
  CooperClassificationVisuals
> = {
  "Muito Fraco": {
    colorClass: "text-rose-400",
    badgeBgClass: "bg-rose-950/60 text-rose-300 border border-rose-500/30",
  },
  Fraco: {
    colorClass: "text-orange-400",
    badgeBgClass: "bg-orange-950/60 text-orange-300 border border-orange-500/30",
  },
  Médio: {
    colorClass: "text-amber-400",
    badgeBgClass: "bg-amber-950/60 text-amber-300 border border-amber-500/30",
  },
  Bom: {
    colorClass: "text-emerald-400",
    badgeBgClass: "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30",
  },
  "Muito Bom": {
    colorClass: "text-teal-400",
    badgeBgClass: "bg-teal-950/60 text-teal-300 border border-teal-500/30",
  },
  Excelente: {
    colorClass: "text-indigo-400",
    badgeBgClass: "bg-indigo-950/60 text-indigo-300 border border-indigo-500/30",
  },
};

export function getBmiColorClass(category: BmiCategory): string {
  return BMI_CATEGORY_COLORS[category];
}

export function getCooperVisuals(
  classification: CooperClassificationLevel
): CooperClassificationVisuals {
  return COOPER_CLASSIFICATION_VISUALS[classification];
}
