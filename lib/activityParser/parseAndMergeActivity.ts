import type { TafWindowSummary } from "@/types";
import { FitParseError, isFitBuffer, parseFit } from "../fit";
import { GpxParseError, GpxSplit, parseGpx, parseGpxXml } from "../gpx";
import {
  ActivityFileKind,
  ActivityParserInput,
  ActivityParseWarning,
  MAX_FIT_GPX_START_DIFF_MS,
  ParsedActivity,
  RawActivityFileInput,
} from "./types";

function toBuffer(
  input: Buffer | Uint8Array | ArrayBuffer | string
): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string") return Buffer.from(input, "utf8");
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new FitParseError(
    "INVALID_FIT",
    "Conteúdo de arquivo inválido para leitura."
  );
}

function toUtf8String(
  input: string | Buffer | Uint8Array | ArrayBuffer
): string {
  if (typeof input === "string") return input;
  return toBuffer(input).toString("utf8");
}

/**
 * Identifica se um arquivo bruto enviado é `.FIT` ou `.GPX` combinando inspeção de
 * assinatura binária (`.FIT` nos bytes 8..11) / tag `<gpx` e extensão do nome do arquivo.
 */
function mergeSplitElevationsFromGpx(
  fitSplits: GpxSplit[],
  gpxSplits: GpxSplit[],
  fitDistanceKm: number,
  gpxDistanceKm: number | null,
  elevationMergedFromGpx: boolean
): GpxSplit[] {
  if (
    fitSplits.length === 0 ||
    gpxSplits.length !== fitSplits.length ||
    gpxDistanceKm === null ||
    gpxDistanceKm <= 0
  ) {
    return fitSplits;
  }

  const fitLacksSplitElevation = fitSplits.every(
    (s) =>
      s.elevationDiffM === null ||
      (elevationMergedFromGpx && s.elevationDiffM === 0)
  );
  const gpxHasSplitElevation = gpxSplits.some((s) => s.elevationDiffM !== null);
  if (!fitLacksSplitElevation || !gpxHasSplitElevation) {
    return fitSplits;
  }

  const maxDistToleranceKm = Math.max(0.25, fitDistanceKm * 0.15);
  if (Math.abs(fitDistanceKm - gpxDistanceKm) > maxDistToleranceKm) {
    return fitSplits;
  }

  const perSplitCompatible = fitSplits.every(
    (s, idx) => Math.abs(s.distanceKm - gpxSplits[idx].distanceKm) <= 0.25
  );
  if (!perSplitCompatible) {
    return fitSplits;
  }

  return fitSplits.map((split, idx) => ({
    ...split,
    elevationDiffM: gpxSplits[idx].elevationDiffM ?? split.elevationDiffM,
  }));
}

export function detectActivityFileKind(
  file: RawActivityFileInput
): ActivityFileKind | "unknown" {
  const buf = toBuffer(file.buffer);
  if (isFitBuffer(buf)) {
    return "fit";
  }

  const ext = file.fileName?.trim().toLowerCase() ?? "";
  const headText = buf
    .subarray(0, Math.min(buf.length, 2048))
    .toString("utf8")
    .trimStart();

  if (headText.includes("<gpx") || ext.endsWith(".gpx")) {
    return "gpx";
  }

  if (ext.endsWith(".fit")) {
    return "fit";
  }

  return "unknown";
}

/**
 * Orquestra o parsing e a mesclagem prioritária (`.FIT` > `.GPX`) para 1 ou 2 arquivos:
 * - Quando apenas `.FIT` é fornecido: retorna `source = "fit_upload"` com 100% dos dados do `.FIT`.
 * - Quando apenas `.GPX` é fornecido: retorna `source = "gpx_upload"` com fallback integral do `.GPX`.
 * - Quando `.FIT` e `.GPX` são fornecidos juntos:
 *   1. Valida a coerência de horário inicial (`|fit.startedAt - gpx.startedAt| > 5 min` -> warning `MISMATCHED_ACTIVITY_FILES`).
 *   2. Mantém prioridade absoluta do `.FIT` para distância, tempo em movimento, tempo decorrido, pace, velocidade, FC, cadência, splits, voltas, calorias e `externalId` (`fit_<sha256>`).
 *   3. Complementa com `<trk><name>` do `.GPX` quando o `.FIT` não traz nome de treino.
 *   4. Complementa com `elevationGainM` do `.GPX` quando `totalAscent` no `.FIT` é `null` ou `0`.
 */
export function parseAndMergeActivity(
  input: ActivityParserInput
): ParsedActivity {
  let fitBuffer: Buffer | null = input.fitBuffer
    ? toBuffer(input.fitBuffer)
    : null;
  let gpxXml: string | null =
    input.gpxXml !== undefined && input.gpxXml !== null
      ? toUtf8String(input.gpxXml)
      : null;

  if (input.files && input.files.length > 0) {
    if (input.files.length > 2) {
      throw new FitParseError(
        "INVALID_FIT",
        "Envie no máximo 2 arquivos simultaneamente (1 .FIT e/ou 1 .GPX do mesmo treino)."
      );
    }

    for (const file of input.files) {
      const kind = detectActivityFileKind(file);
      if (kind === "fit") {
        if (fitBuffer) {
          throw new FitParseError(
            "INVALID_FIT",
            "Não é permitido enviar dois arquivos .FIT simultaneamente. Envie 1 .FIT e, opcionalmente, 1 .GPX complementar."
          );
        }
        fitBuffer = toBuffer(file.buffer);
      } else if (kind === "gpx") {
        if (gpxXml) {
          throw new FitParseError(
            "INVALID_FIT",
            "Não é permitido enviar dois arquivos .GPX simultaneamente. Envie 1 .FIT e, opcionalmente, 1 .GPX complementar."
          );
        }
        gpxXml = toUtf8String(file.buffer);
      } else {
        throw new FitParseError(
          "INVALID_FIT",
          `Formato de arquivo não reconhecido${file.fileName ? ` ("${file.fileName}")` : ""}. Envie um arquivo .FIT e/ou .GPX válido.`
        );
      }
    }
  }

  const hasFit = fitBuffer !== null && fitBuffer.length > 0;
  const hasGpx = gpxXml !== null && gpxXml.trim().length > 0;

  if (!hasFit && !hasGpx) {
    throw new FitParseError(
      "INVALID_FIT",
      "Nenhum arquivo de atividade (.FIT ou .GPX) foi fornecido para leitura."
    );
  }

  // Caso 1: Apenas .GPX enviado (Fallback integral)
  if (!hasFit && hasGpx) {
    const gpx = parseGpx(gpxXml!);
    return {
      source: "gpx_upload",
      filesUsed: ["gpx"],
      name: gpx.name,
      rawType: gpx.rawType,
      sourceActivityKind: gpx.sourceActivityKind,
      isIndoor: false,
      startedAt: gpx.startedAt,
      distanceKm: gpx.distanceKm,
      durationSeconds: gpx.durationSeconds,
      elapsedSeconds: gpx.elapsedSeconds,
      speedKmh: gpx.speedKmh,
      paceSeconds: gpx.paceSeconds,
      paceFormatted: gpx.paceFormatted,
      avgHeartRate: gpx.avgHeartRate,
      maxHeartRate: gpx.maxHeartRate,
      avgCadence: gpx.avgCadence,
      elevationGainM: gpx.elevationGainM,
      activeCalories: null,
      avgTemperatureC: gpx.avgTemperatureC,
      splits: gpx.splits,
      laps: [],
      tafWindow: gpx.tafWindow ?? null,
      externalId: gpx.externalId,
      pointCount: gpx.pointCount,
      warnings: gpx.warnings.map((w) => ({ ...w })),
    };
  }

  // Caso 2: Apenas .FIT enviado (Fonte primária isolada)
  const fit = parseFit(fitBuffer!);
  if (!hasGpx) {
    return {
      source: "fit_upload",
      filesUsed: ["fit"],
      name: fit.name,
      rawType: fit.rawType,
      sourceActivityKind: fit.sourceActivityKind,
      isIndoor: fit.isIndoor,
      startedAt: fit.startedAt,
      distanceKm: fit.distanceKm,
      durationSeconds: fit.durationSeconds,
      elapsedSeconds: fit.elapsedSeconds,
      speedKmh: fit.speedKmh,
      paceSeconds: fit.paceSeconds,
      paceFormatted: fit.paceFormatted,
      avgHeartRate: fit.avgHeartRate,
      maxHeartRate: fit.maxHeartRate,
      avgCadence: fit.avgCadence,
      elevationGainM: fit.elevationGainM,
      activeCalories: fit.activeCalories,
      avgTemperatureC: fit.avgTemperatureC,
      splits: fit.splits,
      laps: fit.laps,
      tafWindow: fit.tafWindow ?? null,
      externalId: fit.externalId,
      pointCount: fit.pointCount,
      warnings: fit.warnings.map((w) => ({ ...w })),
    };
  }

  // Caso 3: .FIT + .GPX enviados juntos (Prioridade absoluta do .FIT + Complemento do .GPX)
  let gpxName: string | null = null;
  let gpxStartedAt: string | null = null;
  let gpxElevationGainM: number | null = null;
  let gpxDistanceKm: number | null = null;
  let gpxSplits: GpxSplit[] = [];
  let gpxKind = fit.sourceActivityKind;
  let gpxRawType: string | null = null;
  let gpxTafWindow: TafWindowSummary | null = null;

  try {
    const parsedGpx = parseGpx(gpxXml!);
    gpxName = parsedGpx.name;
    gpxStartedAt = parsedGpx.startedAt;
    gpxElevationGainM = parsedGpx.elevationGainM;
    gpxDistanceKm = parsedGpx.distanceKm;
    gpxSplits = parsedGpx.splits;
    gpxKind = parsedGpx.sourceActivityKind;
    gpxRawType = parsedGpx.rawType;
    gpxTafWindow = parsedGpx.tafWindow ?? null;
  } catch (err) {
    // Se o XML for completamente inválido ou de esporte incompatível, propaga o erro;
    // caso contrário, tenta extrair ao menos o cabeçalho (<trk><name> e 1º timestamp)
    if (
      err instanceof GpxParseError &&
      (err.code === "INVALID_XML" || err.code === "UNSUPPORTED_ACTIVITY")
    ) {
      throw err;
    }
    const rawXml = parseGpxXml(gpxXml!);
    gpxName = rawXml.name;
    gpxStartedAt = rawXml.firstRawTimestampIso ?? null;
    gpxKind = rawXml.sourceActivityKind;
    gpxRawType = rawXml.rawType;
  }

  const warnings: ActivityParseWarning[] = fit.warnings.map((w) => ({ ...w }));

  // 3.1 Validação de coerência de timestamp inicial (diferença máxima tolerada: 5 minutos)
  if (gpxStartedAt) {
    const fitStartMs = Date.parse(fit.startedAt);
    const gpxStartMs = Date.parse(gpxStartedAt);
    if (Number.isFinite(fitStartMs) && Number.isFinite(gpxStartMs)) {
      const diffMs = Math.abs(fitStartMs - gpxStartMs);
      if (diffMs > MAX_FIT_GPX_START_DIFF_MS) {
        const diffMinutes = Math.round(diffMs / 60000);
        warnings.unshift({
          code: "MISMATCHED_ACTIVITY_FILES",
          message: `Atenção: os arquivos .FIT e .GPX possuem horários de início com diferença de ${diffMinutes} min e parecem ser de treinos diferentes.`,
        });
      }
    }
  }

  // 3.2 Complemento do Nome/Título do treino (<trk><name> do .GPX quando ausente no .FIT)
  let mergedName = fit.name;
  if ((!mergedName || mergedName.trim().length === 0) && gpxName && gpxName.trim().length > 0) {
    mergedName = gpxName.trim();
    warnings.push({
      code: "NAME_MERGED_FROM_GPX",
      message: `Título do treino ("${mergedName}") extraído automaticamente do arquivo .GPX complementar.`,
    });
  }

  // 3.3 Complemento de Ganho de Elevação (quando totalAscent vier nulo ou 0 no .FIT)
  let mergedElevationGainM = fit.elevationGainM;
  let elevationMergedFromGpx = false;
  if (
    (mergedElevationGainM === null || mergedElevationGainM === 0) &&
    gpxElevationGainM !== null &&
    gpxElevationGainM > 0
  ) {
    mergedElevationGainM = gpxElevationGainM;
    elevationMergedFromGpx = true;
    const noEleIdx = warnings.findIndex((w) => w.code === "NO_ELEVATION_DATA");
    if (noEleIdx !== -1) {
      warnings.splice(noEleIdx, 1);
    }
    warnings.push({
      code: "ELEVATION_MERGED_FROM_GPX",
      message: `Ganho de elevação (+${mergedElevationGainM} m) complementado a partir do arquivo .GPX.`,
    });
  }

  const mergedSplits = mergeSplitElevationsFromGpx(
    fit.splits,
    gpxSplits,
    fit.distanceKm,
    gpxDistanceKm,
    elevationMergedFromGpx
  );

  // 3.4 Complemento de modalidade caso o .FIT venha como genérico/unknown
  let mergedKind = fit.sourceActivityKind;
  let mergedRawType = fit.rawType;
  if (mergedKind === "unknown" && gpxKind !== "unknown") {
    mergedKind = gpxKind;
    mergedRawType = mergedRawType ?? gpxRawType;
    const unkIdx = warnings.findIndex((w) => w.code === "UNKNOWN_ACTIVITY_TYPE");
    if (unkIdx !== -1) {
      warnings.splice(unkIdx, 1);
    }
  } else if (
    mergedKind !== "unknown" &&
    gpxKind !== "unknown" &&
    mergedKind !== gpxKind
  ) {
    const fitLabel = mergedKind === "walk" ? "Caminhada" : "Corrida";
    const gpxLabel = gpxKind === "walk" ? "Caminhada" : "Corrida";
    warnings.push({
      code: "ACTIVITY_TYPE_MISMATCH",
      message: `Atenção: o arquivo .FIT indica ${fitLabel} e o .GPX indica ${gpxLabel}; mantendo a classificação do .FIT. Confirme a modalidade antes de salvar.`,
    });
  }

  return {
    source: "fit_upload",
    filesUsed: ["fit", "gpx"],
    name: mergedName,
    rawType: mergedRawType,
    sourceActivityKind: mergedKind,
    isIndoor: fit.isIndoor,
    startedAt: fit.startedAt,
    distanceKm: fit.distanceKm,
    durationSeconds: fit.durationSeconds,
    elapsedSeconds: fit.elapsedSeconds,
    speedKmh: fit.speedKmh,
    paceSeconds: fit.paceSeconds,
    paceFormatted: fit.paceFormatted,
    avgHeartRate: fit.avgHeartRate,
    maxHeartRate: fit.maxHeartRate,
    avgCadence: fit.avgCadence,
    elevationGainM: mergedElevationGainM,
    activeCalories: fit.activeCalories,
    avgTemperatureC: fit.avgTemperatureC,
    splits: mergedSplits,
    laps: fit.laps,
    tafWindow: fit.tafWindow ?? gpxTafWindow ?? null,
    externalId: fit.externalId,
    pointCount: fit.pointCount,
    warnings,
  };
}

export const activityParserService = {
  detectActivityFileKind,
  parseAndMergeActivity,
};
