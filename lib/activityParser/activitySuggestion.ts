import { extractActivityTitleFromFilename } from "./filenameTitle";
import {
  ACTIVITY_TYPES,
  type ActivityParsePreview,
  type ActivityType,
} from "@/types";
import type { GpxSourceActivityKind } from "../gpx/types";

export const RUN_ACTIVITY_TYPES: readonly ActivityType[] = [
  "rodagem_leve",
  "corrida_continua",
  "tempo_run",
  "corrida_intervalada",
  "longao",
];

export const WALK_ACTIVITY_TYPES: readonly ActivityType[] = ["caminhada"];

export interface ActivitySuggestionContext {
  sourceActivityKind: GpxSourceActivityKind;
  name?: string | null;
  suggestedNotes?: string | null;
  fileNames?: readonly (string | null | undefined)[];
  speedKmh?: number | null;
  distanceKm?: number | null;
  durationSeconds?: number | null;
  avgCadence?: number | null;
}

const WALK_KEYWORD_REGEX =
  /\b(caminhada|caminhadas|caminhando|caminhar|walk|walks|walking|hike|hikes|hiking|trilha|trilhas|trekking|marcha|ruck|rucking)\b/;
const RUN_KEYWORD_REGEX =
  /\b(corrida|corridas|correndo|correr|run|runs|running|jog|jogging|rodagem|rodagens|tiro|tiros|intervalado|intervalada|interval|temporun|tempo\s+run|longao|cooper|maratona|fartlek|trote)\b/;

function normalizeSuggestionText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectKeywordSignals(context: ActivitySuggestionContext): {
  hasWalkKeyword: boolean;
  hasRunKeyword: boolean;
} {
  const candidates: string[] = [];
  if (typeof context.name === "string" && context.name.trim()) {
    candidates.push(context.name);
  }
  if (
    typeof context.suggestedNotes === "string" &&
    context.suggestedNotes.trim()
  ) {
    candidates.push(context.suggestedNotes);
  }
  for (const rawName of context.fileNames ?? []) {
    const title = extractActivityTitleFromFilename(rawName);
    if (title) {
      candidates.push(title);
    } else if (typeof rawName === "string" && rawName.trim()) {
      candidates.push(rawName);
    }
  }

  let hasWalkKeyword = false;
  let hasRunKeyword = false;

  for (const candidate of candidates) {
    const normalized = normalizeSuggestionText(candidate);
    if (!normalized) continue;
    if (WALK_KEYWORD_REGEX.test(normalized)) {
      hasWalkKeyword = true;
    }
    if (RUN_KEYWORD_REGEX.test(normalized)) {
      hasRunKeyword = true;
    }
  }

  return { hasWalkKeyword, hasRunKeyword };
}

function resolveEffectiveSpeedKmh(
  context: ActivitySuggestionContext
): number | null {
  if (
    typeof context.speedKmh === "number" &&
    Number.isFinite(context.speedKmh) &&
    context.speedKmh > 0
  ) {
    return context.speedKmh;
  }

  if (
    typeof context.distanceKm === "number" &&
    Number.isFinite(context.distanceKm) &&
    context.distanceKm > 0 &&
    typeof context.durationSeconds === "number" &&
    Number.isFinite(context.durationSeconds) &&
    context.durationSeconds > 0
  ) {
    return context.distanceKm / (context.durationSeconds / 3600);
  }

  return null;
}

/**
 * Infere `"caminhada"` vs `"corrida_continua"` quando o arquivo veio sem tipo explícito (`"unknown"`),
 * combinando palavras-chave do título/nome do arquivo com velocidade média e cadência.
 */
export function inferSuggestedActivityTypeForUnknown(
  context: Omit<ActivitySuggestionContext, "sourceActivityKind">
): ActivityType | null {
  const fullContext: ActivitySuggestionContext = {
    sourceActivityKind: "unknown",
    ...context,
  };
  const { hasWalkKeyword, hasRunKeyword } = collectKeywordSignals(fullContext);
  const effectiveSpeedKmh = resolveEffectiveSpeedKmh(fullContext);
  const cadence =
    typeof fullContext.avgCadence === "number" &&
    Number.isFinite(fullContext.avgCadence) &&
    fullContext.avgCadence > 0
      ? fullContext.avgCadence
      : null;

  // Palavras-chave explícitas desempatam faixas plausíveis de velocidade
  if (
    hasWalkKeyword &&
    !hasRunKeyword &&
    (effectiveSpeedKmh === null || effectiveSpeedKmh < 9.5)
  ) {
    return "caminhada";
  }

  if (
    hasRunKeyword &&
    !hasWalkKeyword &&
    (effectiveSpeedKmh === null || effectiveSpeedKmh >= 5.5)
  ) {
    return "corrida_continua";
  }

  if (effectiveSpeedKmh === null) {
    return null;
  }

  if (effectiveSpeedKmh < 6.8) {
    if (effectiveSpeedKmh >= 5.8 && cadence !== null && cadence >= 156) {
      return "corrida_continua";
    }
    return "caminhada";
  }

  if (effectiveSpeedKmh < 7.5) {
    if (cadence !== null) {
      if (cadence < 140) return "caminhada";
      if (cadence >= 145) return "corrida_continua";
    }
    return effectiveSpeedKmh < 7.0 ? "caminhada" : "corrida_continua";
  }

  return "corrida_continua";
}

/**
 * Determina a sugestão inicial de `activityType` e a lista de modalidades da mesma família.
 */
export function resolveActivityTypeSuggestions(
  context: ActivitySuggestionContext
): {
  suggestedActivityType: ActivityType | null;
  allowedActivityTypes: ActivityType[];
} {
  if (context.sourceActivityKind === "walk") {
    return {
      suggestedActivityType: "caminhada",
      allowedActivityTypes: [...WALK_ACTIVITY_TYPES],
    };
  }
  if (context.sourceActivityKind === "run") {
    return {
      suggestedActivityType: "corrida_continua",
      allowedActivityTypes: [...RUN_ACTIVITY_TYPES],
    };
  }

  return {
    suggestedActivityType: inferSuggestedActivityTypeForUnknown(context),
    allowedActivityTypes: [...ACTIVITY_TYPES],
  };
}

/**
 * Helper compartilhado entre importação individual e em massa para resolver o tipo inicial
 * mesmo quando `suggestedActivityType` vier `null` (ex.: arquivo sem tag esportiva ou mock parcial).
 */
export function resolveDefaultActivityTypeFromPreview(
  preview: Pick<
    ActivityParsePreview,
    | "sourceActivityKind"
    | "suggestedActivityType"
    | "name"
    | "suggestedNotes"
    | "speedKmh"
    | "distanceKm"
    | "durationSeconds"
    | "avgCadence"
  > | null | undefined,
  extraFileNames?: readonly (string | null | undefined)[]
): ActivityType {
  if (!preview) {
    return "corrida_continua";
  }

  if (preview.suggestedActivityType) {
    return preview.suggestedActivityType;
  }

  if (preview.sourceActivityKind === "walk") {
    return "caminhada";
  }

  if (preview.sourceActivityKind === "run") {
    return "corrida_continua";
  }

  return (
    inferSuggestedActivityTypeForUnknown({
      name: preview.name,
      suggestedNotes: preview.suggestedNotes,
      fileNames: extraFileNames,
      speedKmh: preview.speedKmh,
      distanceKm: preview.distanceKm,
      durationSeconds: preview.durationSeconds,
      avgCadence: preview.avgCadence,
    }) ?? "corrida_continua"
  );
}
