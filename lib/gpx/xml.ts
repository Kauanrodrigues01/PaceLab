import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  GpxActivityClassification,
  GpxParseError,
  GpxSegment,
  GpxSourceActivityKind,
  GpxTrackPoint,
  GpxWarning,
  MAX_TRACKPOINTS_DEFAULT,
  MAX_VALID_HEART_RATE,
  MIN_VALID_HEART_RATE,
  OTHER_SPORT_TYPE_ALIASES,
  RUN_TYPE_ALIASES,
  WALK_TYPE_ALIASES,
} from "./types";

export interface ParsedGpxXmlResult {
  name: string | null;
  rawType: string | null;
  sourceActivityKind: GpxSourceActivityKind;
  segments: GpxSegment[];
  rawTrackPointCount: number;
  rawTimedPointCount: number;
  validTrackPointCount: number;
  skippedMissingTimeCount: number;
  skippedInvalidCoordCount: number;
  firstRawTimestampIso: string;
  lastRawTimestampIso: string;
  warnings: GpxWarning[];
}

/**
 * Sanitiza strings livres extraídas de XML/FIT (`<name>`, `<type>`, `workoutName`),
 * removendo blocos `<script>`/`<style>`, tags HTML, caracteres de controle e whitespace excessivo.
 */
export function sanitizeActivityText(
  raw: unknown,
  maxLength = 300
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  let candidate: string;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["#text"] === "string" || typeof obj["#text"] === "number") {
      candidate = String(obj["#text"]);
    } else {
      return null;
    }
  } else {
    candidate = String(raw);
  }

  const cleaned = candidate
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

/**
 * Normaliza o conteúdo de `<trk><type>` (minúsculas, sem acentos, espaços, hífens ou underscores)
 * e classifica na família correspondente (D5).
 */
export function classifyActivityType(
  rawType: string | number | null | undefined
): GpxActivityClassification {
  if (rawType === null || rawType === undefined) {
    return "unknown";
  }

  const normalized = String(rawType)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, "");

  if (!normalized) {
    return "unknown";
  }

  if (RUN_TYPE_ALIASES.has(normalized)) {
    return "run";
  }

  if (WALK_TYPE_ALIASES.has(normalized)) {
    return "walk";
  }

  if (OTHER_SPORT_TYPE_ALIASES.has(normalized)) {
    return "other";
  }

  return "unknown";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function lookupExtensionTag(
  container: Record<string, unknown> | undefined | null,
  localName: string
): unknown {
  if (!container || typeof container !== "object") {
    return undefined;
  }

  const lowerLocal = localName.toLowerCase();
  for (const [key, val] of Object.entries(container)) {
    const kLower = key.toLowerCase();
    if (kLower === lowerLocal || kLower.endsWith(`:${lowerLocal}`)) {
      return val;
    }
  }
  return undefined;
}

function extractPointExtensions(rawExtensions: unknown): {
  heartRateBpm: number | null;
  cadenceRaw: number | null;
  temperatureC: number | null;
  powerW: number | null;
} {
  if (!rawExtensions || typeof rawExtensions !== "object") {
    return {
      heartRateBpm: null,
      cadenceRaw: null,
      temperatureC: null,
      powerW: null,
    };
  }

  const extObj = rawExtensions as Record<string, unknown>;
  const tpxNode = lookupExtensionTag(extObj, "TrackPointExtension");
  const tpxObj =
    tpxNode && typeof tpxNode === "object"
      ? (tpxNode as Record<string, unknown>)
      : null;

  const rawHr = lookupExtensionTag(tpxObj, "hr") ?? lookupExtensionTag(extObj, "hr");
  const rawCad =
    lookupExtensionTag(tpxObj, "cad") ??
    lookupExtensionTag(tpxObj, "runcadence") ??
    lookupExtensionTag(extObj, "cad") ??
    lookupExtensionTag(extObj, "runcadence");
  const rawTemp =
    lookupExtensionTag(tpxObj, "atemp") ?? lookupExtensionTag(extObj, "atemp");
  const rawPower =
    lookupExtensionTag(extObj, "power") ?? lookupExtensionTag(tpxObj, "power");

  const parsedHr = toFiniteNumber(rawHr);
  const heartRateBpm =
    parsedHr !== null &&
    Math.round(parsedHr) >= MIN_VALID_HEART_RATE &&
    Math.round(parsedHr) <= MAX_VALID_HEART_RATE
      ? Math.round(parsedHr)
      : null;

  const parsedCad = toFiniteNumber(rawCad);
  const cadenceRaw =
    parsedCad !== null && parsedCad >= 0 ? Math.round(parsedCad) : null;

  const temperatureC = toFiniteNumber(rawTemp);

  const parsedPower = toFiniteNumber(rawPower);
  const powerW =
    parsedPower !== null && parsedPower >= 0 ? Math.round(parsedPower) : null;

  return {
    heartRateBpm,
    cadenceRaw,
    temperatureC,
    powerW,
  };
}

/**
 * Faz o parse e validação estrutural do XML GPX 1.1, extraindo segmentos, pontos e extensões.
 */
export function parseGpxXml(
  rawXmlInput: string,
  options?: { maxTrackPoints?: number }
): ParsedGpxXmlResult {
  const maxTrackPoints = options?.maxTrackPoints ?? MAX_TRACKPOINTS_DEFAULT;

  if (typeof rawXmlInput !== "string" || !rawXmlInput.trim()) {
    throw new GpxParseError(
      "INVALID_XML",
      "O arquivo .GPX enviado está vazio ou não pôde ser lido como texto."
    );
  }

  // Remove BOM UTF-8 se presente e normaliza quebras de linha
  const cleanedXml = rawXmlInput.replace(/^\uFEFF/, "").trim();

  // Bloqueio explícito contra DTD / expansão de entidades (XXE / Billion Laughs)
  if (/<!(?:DOCTYPE|ENTITY|ATTLIST|ELEMENT|NOTATION)\b/i.test(cleanedXml)) {
    throw new GpxParseError(
      "INVALID_XML",
      "Arquivo .GPX rejeitado: declarações DTD/ENTITY não são permitidas."
    );
  }

  const validation = XMLValidator.validate(cleanedXml);
  if (validation !== true) {
    throw new GpxParseError(
      "INVALID_XML",
      "O arquivo enviado não possui estrutura XML válida.",
      { reason: validation.err?.msg }
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    parseTagValue: false,
    trimValues: true,
    isArray: (tagName) => {
      const lower = tagName.toLowerCase();
      return (
        lower === "trk" ||
        lower.endsWith(":trk") ||
        lower === "trkseg" ||
        lower.endsWith(":trkseg") ||
        lower === "trkpt" ||
        lower.endsWith(":trkpt")
      );
    },
  });

  let parsedDoc: Record<string, unknown>;
  try {
    parsedDoc = parser.parse(cleanedXml) as Record<string, unknown>;
  } catch {
    throw new GpxParseError(
      "INVALID_XML",
      "Falha ao interpretar o conteúdo XML do arquivo .GPX."
    );
  }

  const gpxRoot = lookupExtensionTag(parsedDoc, "gpx") as
    | Record<string, unknown>
    | undefined;
  if (!gpxRoot || typeof gpxRoot !== "object") {
    throw new GpxParseError(
      "INVALID_XML",
      "Elemento raiz <gpx> não encontrado no arquivo."
    );
  }

  const trkListRaw = lookupExtensionTag(gpxRoot, "trk");
  const trkList = Array.isArray(trkListRaw)
    ? trkListRaw
    : trkListRaw
      ? [trkListRaw]
      : [];

  if (trkList.length === 0) {
    throw new GpxParseError(
      "NO_TRACKPOINTS",
      "O arquivo .GPX não contém nenhuma trilha (<trk>)."
    );
  }

  const firstTrk = trkList[0] as Record<string, unknown>;
  const rawNameVal = lookupExtensionTag(firstTrk, "name");
  const name = sanitizeActivityText(rawNameVal, 300);

  const rawTypeVal = lookupExtensionTag(firstTrk, "type");
  const rawType = sanitizeActivityText(rawTypeVal, 100);

  const classification = classifyActivityType(rawType);
  if (classification === "other") {
    throw new GpxParseError(
      "UNSUPPORTED_ACTIVITY",
      `Modalidade não suportada para importação no PaceLab (${rawType ?? "desconhecida"}). Apenas corridas e caminhadas são aceitas.`,
      { rawType }
    );
  }

  const sourceActivityKind: GpxSourceActivityKind = classification;
  const warnings: GpxWarning[] = [];

  if (sourceActivityKind === "unknown") {
    warnings.push({
      code: "UNKNOWN_ACTIVITY_TYPE",
      message: rawType
        ? `Tipo de atividade "${rawType}" não reconhecido automaticamente; confirme a modalidade antes de salvar.`
        : "O arquivo .GPX não informa o tipo da atividade (<type>); escolha a modalidade antes de salvar.",
    });
  }

  // Coletar todos os <trkseg> de todas as trilhas <trk>
  const rawSegments: Array<Record<string, unknown>> = [];
  for (const trk of trkList) {
    if (!trk || typeof trk !== "object") continue;
    const segs = lookupExtensionTag(trk as Record<string, unknown>, "trkseg");
    if (Array.isArray(segs)) {
      for (const s of segs) {
        if (s && typeof s === "object") {
          rawSegments.push(s as Record<string, unknown>);
        }
      }
    } else if (segs && typeof segs === "object") {
      rawSegments.push(segs as Record<string, unknown>);
    }
  }

  let rawTrackPointCount = 0;
  for (const seg of rawSegments) {
    const pts = lookupExtensionTag(seg, "trkpt");
    if (Array.isArray(pts)) {
      rawTrackPointCount += pts.length;
    } else if (pts && typeof pts === "object") {
      rawTrackPointCount += 1;
    }
  }

  if (rawTrackPointCount === 0) {
    throw new GpxParseError(
      "NO_TRACKPOINTS",
      "O arquivo .GPX não contém pontos de trajeto (<trkpt>)."
    );
  }

  if (rawTrackPointCount > maxTrackPoints) {
    throw new GpxParseError(
      "TOO_MANY_POINTS",
      `O arquivo .GPX possui ${rawTrackPointCount} pontos, excedendo o limite máximo permitido (${maxTrackPoints}).`,
      { pointCount: rawTrackPointCount, maxTrackPoints }
    );
  }

  const segments: GpxSegment[] = [];
  let validTrackPointCount = 0;
  let rawTimedPointCount = 0;
  let skippedMissingTimeCount = 0;
  let skippedInvalidCoordCount = 0;
  let firstRawTimestampIso: string | null = null;
  let lastRawTimestampIso: string | null = null;

  for (const seg of rawSegments) {
    const ptsRaw = lookupExtensionTag(seg, "trkpt");
    const ptsList = Array.isArray(ptsRaw)
      ? ptsRaw
      : ptsRaw && typeof ptsRaw === "object"
        ? [ptsRaw]
        : [];

    const segmentPoints: GpxTrackPoint[] = [];

    for (const ptItem of ptsList) {
      if (!ptItem || typeof ptItem !== "object") continue;
      const pt = ptItem as Record<string, unknown>;

      // Extrair timestamps brutos primeiro para garantir que reordenação de atributos não afete externalId
      const rawTimeVal = lookupExtensionTag(pt, "time");
      const rawTimeStr =
        rawTimeVal !== undefined && rawTimeVal !== null
          ? String(rawTimeVal).trim()
          : "";
      const timestampMs = rawTimeStr ? Date.parse(rawTimeStr) : Number.NaN;
      const hasValidTime = !Number.isNaN(timestampMs);

      if (hasValidTime) {
        const iso = new Date(timestampMs).toISOString();
        rawTimedPointCount++;
        if (firstRawTimestampIso === null) {
          firstRawTimestampIso = iso;
        }
        lastRawTimestampIso = iso;
      }

      const lat = toFiniteNumber(pt["@_lat"]);
      const lon = toFiniteNumber(pt["@_lon"]);
      if (
        lat === null ||
        lon === null ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        skippedInvalidCoordCount++;
        continue;
      }

      if (!hasValidTime) {
        skippedMissingTimeCount++;
        continue;
      }

      const timestampIso = new Date(timestampMs).toISOString();
      const elevationM = toFiniteNumber(lookupExtensionTag(pt, "ele"));
      const ext = extractPointExtensions(lookupExtensionTag(pt, "extensions"));

      segmentPoints.push({
        lat,
        lon,
        timestampMs,
        timestampIso,
        elevationM,
        heartRateBpm: ext.heartRateBpm,
        cadenceRaw: ext.cadenceRaw,
        temperatureC: ext.temperatureC,
        powerW: ext.powerW,
      });
      validTrackPointCount++;
    }

    if (segmentPoints.length > 0) {
      segments.push({ points: segmentPoints });
    }
  }

  if (validTrackPointCount === 0) {
    if (skippedMissingTimeCount > 0) {
      throw new GpxParseError(
        "NO_TIMESTAMPS",
        "O arquivo .GPX não possui timestamps (<time>) nos pontos de trajeto. Exportações sem tempo não permitem calcular pace e duração."
      );
    }
    throw new GpxParseError(
      "NO_TRACKPOINTS",
      "Nenhum ponto de trajeto (<trkpt>) com coordenadas válidas foi encontrado no arquivo .GPX."
    );
  }

  if (skippedInvalidCoordCount > 0) {
    warnings.push({
      code: "OUT_OF_RANGE_COORDS_SKIPPED",
      message: `${skippedInvalidCoordCount} ponto(s) com coordenadas inválidas ou fora de faixa foram ignorados.`,
      count: skippedInvalidCoordCount,
    });
  }

  if (skippedMissingTimeCount > 0) {
    warnings.push({
      code: "MISSING_TIMESTAMPS_SKIPPED",
      message: `${skippedMissingTimeCount} ponto(s) sem timestamp (<time>) válido foram ignorados.`,
      count: skippedMissingTimeCount,
    });
  }

  if (segments.length > 1) {
    warnings.push({
      code: "MULTIPLE_SEGMENTS_DETECTED",
      message: `Foram detectados ${segments.length} segmentos (<trkseg>). Os intervalos entre segmentos foram tratados como pausas na gravação.`,
      count: segments.length,
    });
  }

  return {
    name,
    rawType,
    sourceActivityKind,
    segments,
    rawTrackPointCount,
    rawTimedPointCount,
    validTrackPointCount,
    skippedMissingTimeCount,
    skippedInvalidCoordCount,
    firstRawTimestampIso: firstRawTimestampIso!,
    lastRawTimestampIso: lastRawTimestampIso!,
    warnings,
  };
}
