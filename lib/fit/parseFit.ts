import { createHash } from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";
import { formatPaceSeconds } from "../gpx/metrics";
import { calculateElevationGain } from "../gpx/elevation";
import { splitByDistance } from "../gpx/splits";
import { classifyActivityType, sanitizeActivityText } from "../gpx/xml";
import {
  CADENCE_SINGLE_FOOT_MAX,
  GpxSourceActivityKind,
  GpxSplit,
  MAX_AVG_MOVING_SPEED_KMH,
  MAX_VALID_HEART_RATE,
  MIN_AVG_MOVING_SPEED_KMH,
  MIN_RESIDUAL_SPLIT_METERS,
  MIN_VALID_HEART_RATE,
} from "../gpx/types";
import type { LapDetail } from "@/types";
import {
  extractBestTafWindow,
  samplesFromFitRecords,
} from "../activityParser/window";
import {
  areLapsUniform1Km,
  buildFitMotionSteps,
  computeLapElevationDiff,
  hasExplicitTimerPauseEvents,
  motionStepsToSplitInputs,
  summarizeFitMotion,
} from "./movingMetrics";
import {
  FIT_MAGIC_SIGNATURE,
  FIT_MAX_VALID_SPEED_MS,
  FIT_PAUSE_HYSTERESIS_MIN_SECONDS,
  FitParseError,
  FitRecordPoint,
  FitWarning,
  ParsedFit,
  SEMICIRCLES_TO_DEGREES,
} from "./types";

function toNodeBuffer(input: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new FitParseError(
    "INVALID_FIT",
    "Formato binário inválido para leitura de arquivo .FIT."
  );
}

/**
 * Detecta se o buffer corresponde a um arquivo binário .FIT verificando a assinatura
 * nos bytes 8..11 (`.FIT`) e validando via `Decoder.isFIT(stream)`.
 */
export function isFitBuffer(
  input: Buffer | Uint8Array | ArrayBuffer | null | undefined
): boolean {
  if (!input) return false;
  try {
    const buf = toNodeBuffer(input);
    if (buf.length < 14) return false;
    const magic = buf.subarray(8, 12).toString("ascii");
    if (magic !== FIT_MAGIC_SIGNATURE) return false;
    const stream = Stream.fromBuffer(buf);
    return Decoder.isFIT(stream);
  } catch {
    return false;
  }
}

/**
 * Converte coordenadas em semicircles do protocolo Garmin FIT para graus decimais:
 * `degrees = semicircles * (180 / 2^31)`.
 */
export function semicirclesToDegrees(
  semicircles: number | null | undefined
): number | null {
  if (typeof semicircles !== "number" || !Number.isFinite(semicircles)) {
    return null;
  }
  // 0x7FFFFFFF (2147483647) é o valor sentinela "inválido" do protocolo FIT para sint32
  if (semicircles === 0x7fffffff || Math.abs(semicircles) > Math.pow(2, 31)) {
    return null;
  }
  const deg = semicircles * SEMICIRCLES_TO_DEGREES;
  if (deg < -180 || deg > 180) {
    return null;
  }
  return deg;
}

/**
 * Gera a chave anti-duplicação (`externalId`) determinística para arquivos .FIT:
 * `"fit_" + sha256("${startTimeIso}_${Math.round(distanceKm * 1000)}")`.
 */
export function computeFitExternalId(
  startTimeIso: string,
  distanceKm: number
): string {
  const parsedMs = Date.parse(startTimeIso.trim());
  const normalizedIso = Number.isFinite(parsedMs)
    ? new Date(parsedMs).toISOString()
    : startTimeIso.trim();
  const canonical = `${normalizedIso}_${Math.round(distanceKm * 1000)}`;
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `fit_${hash}`;
}

function parseFitDateToIso(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? val.toISOString() : null;
  }
  if (typeof val === "string" || typeof val === "number") {
    const ms = new Date(val).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

function parseFitDateToMs(val: unknown): number | null {
  const iso = parseFitDateToIso(val);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function sanitizeHeartRate(val: unknown): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  const rounded = Math.round(val);
  if (rounded < MIN_VALID_HEART_RATE || rounded > MAX_VALID_HEART_RATE) {
    return null;
  }
  return rounded;
}

function classifyFitSport(
  sportRaw: unknown,
  subSportRaw: unknown
): {
  kind: GpxSourceActivityKind;
  rawType: string | null;
  sport: string | null;
  subSport: string | null;
  isIndoorSubSport: boolean;
} {
  const sport =
    typeof sportRaw === "string" && sportRaw.trim().length > 0
      ? sportRaw.trim().toLowerCase()
      : typeof sportRaw === "number"
        ? String(sportRaw)
        : null;

  const subSport =
    typeof subSportRaw === "string" && subSportRaw.trim().length > 0
      ? subSportRaw.trim().toLowerCase()
      : typeof subSportRaw === "number"
        ? String(subSportRaw)
        : null;

  const rawType =
    sport && subSport && subSport !== "generic"
      ? `${sport}:${subSport}`
      : sport ?? subSport ?? null;

  const isIndoorSubSport =
    subSport === "treadmill" ||
    subSport === "indoor_running" ||
    subSport === "indoor_walking" ||
    subSport === "virtual_activity" ||
    subSport === "indoor_track";

  if (!sport && !subSport) {
    return {
      kind: "unknown",
      rawType: null,
      sport: null,
      subSport: null,
      isIndoorSubSport: false,
    };
  }

  // No protocolo FIT: sport="running" ou "1", sport="walking" ou "11", sport="hiking" ou "17"
  if (
    sport === "running" ||
    sport === "run" ||
    subSport === "treadmill" ||
    subSport === "indoor_running" ||
    subSport === "street" ||
    subSport === "trail" ||
    subSport === "track"
  ) {
    return {
      kind: "run",
      rawType,
      sport,
      subSport,
      isIndoorSubSport,
    };
  }

  if (
    sport === "walking" ||
    sport === "walk" ||
    sport === "hiking" ||
    sport === "mountaineering" ||
    subSport === "indoor_walking" ||
    subSport === "casual_walking" ||
    subSport === "speed_walking"
  ) {
    return {
      kind: "walk",
      rawType,
      sport,
      subSport,
      isIndoorSubSport,
    };
  }

  if (sport === "generic" || sport === "training") {
    return {
      kind: "unknown",
      rawType,
      sport,
      subSport,
      isIndoorSubSport,
    };
  }

  // Fallback para o classificador textual compartilhado
  const classified = classifyActivityType(sport ?? subSport);
  if (classified === "other") {
    throw new FitParseError(
      "UNSUPPORTED_ACTIVITY",
      `Modalidade "${rawType}" no arquivo .FIT não é suportada. O PaceLab aceita apenas atividades de corrida ou caminhada.`,
      { rawType, sport, subSport }
    );
  }

  return {
    kind: classified,
    rawType,
    sport,
    subSport,
    isIndoorSubSport,
  };
}

/**
 * Sintetiza splits de 1 km proporcionais ao resumo da sessão quando o .FIT não possui
 * múltiplas voltas (`lapMesgs`) nem registros granulares com distância (`recordMesgs`).
 */
function synthesizeSplitsFromSession(
  totalDistanceM: number,
  durationSeconds: number,
  avgHeartRate: number | null
): GpxSplit[] {
  if (totalDistanceM <= 0 || durationSeconds <= 0) return [];
  const splits: GpxSplit[] = [];
  const fullKms = Math.floor(totalDistanceM / 1000);
  const residualM = totalDistanceM - fullKms * 1000;
  const secPerMeter = durationSeconds / totalDistanceM;

  for (let k = 1; k <= fullKms; k++) {
    const splitSec = Math.max(1, Math.round(1000 * secPerMeter));
    splits.push({
      kilometer: k,
      distanceKm: 1,
      durationSeconds: splitSec,
      paceSeconds: splitSec,
      paceFormatted: formatPaceSeconds(splitSec),
      avgHeartRate,
      elevationDiffM: null,
    });
  }

  if (residualM >= MIN_RESIDUAL_SPLIT_METERS) {
    const distKm = Math.min(1, Number((residualM / 1000).toFixed(3)));
    const splitSec = Math.max(1, Math.round(residualM * secPerMeter));
    const paceSec = Math.max(1, Math.round(1000 * secPerMeter));
    splits.push({
      kilometer: fullKms + 1,
      distanceKm: distKm,
      durationSeconds: splitSec,
      paceSeconds: paceSec,
      paceFormatted: formatPaceSeconds(paceSec),
      avgHeartRate,
      elevationDiffM: null,
    });
  }

  return splits;
}

function isValidLapMovingTime(l: Record<string, unknown>): boolean {
  const timer = typeof l.totalTimerTime === "number" ? l.totalTimerTime : 0;
  const elapsed =
    typeof l.totalElapsedTime === "number" && l.totalElapsedTime > 0
      ? l.totalElapsedTime
      : timer;
  return (
    typeof l.totalMovingTime === "number" &&
    Number.isFinite(l.totalMovingTime) &&
    l.totalMovingTime > 0 &&
    (elapsed <= 0 || l.totalMovingTime <= elapsed + 1)
  );
}

function resolveLapMovingSec(l: Record<string, unknown>): number {
  const timer =
    typeof l.totalTimerTime === "number" && Number.isFinite(l.totalTimerTime)
      ? l.totalTimerTime
      : 0;
  if (isValidLapMovingTime(l)) {
    return l.totalMovingTime as number;
  }
  return timer;
}

/**
 * Decodifica um arquivo binário `.FIT` usando `@garmin/fitsdk`, extraindo o resumo oficial
 * de `sessionMesgs[0]`, voltas reais de `lapMesgs` e/ou parciais km a km de `recordMesgs`.
 */
export function parseFit(
  input: Buffer | Uint8Array | ArrayBuffer
): ParsedFit {
  const buf = toNodeBuffer(input);

  if (!isFitBuffer(buf)) {
    throw new FitParseError(
      "INVALID_FIT",
      "O arquivo enviado não é um binário .FIT válido (assinatura .FIT ausente ou cabeçalho corrompido)."
    );
  }

  let decoded: {
    messages: Record<string, Array<Record<string, unknown>>>;
    errors: unknown[];
  };

  try {
    const stream = Stream.fromBuffer(buf);
    const decoder = new Decoder(stream);
    decoded = decoder.read() as unknown as {
      messages: Record<string, Array<Record<string, unknown>>>;
      errors: unknown[];
    };
  } catch (err) {
    throw new FitParseError(
      "INVALID_FIT",
      `Não foi possível decodificar o arquivo .FIT: ${err instanceof Error ? err.message : "erro binário"}.`
    );
  }

  const sessionMesgs = decoded.messages?.sessionMesgs ?? [];
  const lapMesgs = decoded.messages?.lapMesgs ?? [];
  const recordMesgs = decoded.messages?.recordMesgs ?? [];
  const workoutMesgs = decoded.messages?.workoutMesgs ?? [];
  const eventMesgs = decoded.messages?.eventMesgs ?? [];

  if (
    sessionMesgs.length === 0 &&
    lapMesgs.length === 0 &&
    recordMesgs.length === 0
  ) {
    if (Array.isArray(decoded.errors) && decoded.errors.length > 0) {
      throw new FitParseError(
        "INVALID_FIT",
        "O arquivo .FIT está corrompido ou truncado e não pôde ser decodificado."
      );
    }
    throw new FitParseError(
      "NO_SESSION_DATA",
      "O arquivo .FIT não contém mensagens de sessão (sessionMesgs), voltas (lapMesgs) ou registros (recordMesgs)."
    );
  }

  const session = sessionMesgs[0] ?? {};

  // Parseia recordMesgs para pontos normalizados (incluindo conversão de semicircles -> graus)
  const records: FitRecordPoint[] = [];
  let hasGpsCoords = false;
  let maxRecordHr: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  let cadSum = 0;
  let cadCount = 0;
  let tempSum = 0;
  let tempCount = 0;

  for (const rec of recordMesgs) {
    const iso = parseFitDateToIso(rec.timestamp);
    if (!iso) continue;
    const timestampMs = Date.parse(iso);

    const lat = semicirclesToDegrees(rec.positionLat as number | undefined);
    const lon = semicirclesToDegrees(rec.positionLong as number | undefined);
    if (lat !== null && lon !== null) {
      hasGpsCoords = true;
    }

    const rawEle =
      typeof rec.enhancedAltitude === "number"
        ? rec.enhancedAltitude
        : typeof rec.altitude === "number"
          ? rec.altitude
          : null;
    const elevationM =
      rawEle !== null && Number.isFinite(rawEle) ? rawEle : null;

    const hr = sanitizeHeartRate(rec.heartRate);
    if (hr !== null) {
      hrSum += hr;
      hrCount++;
      if (maxRecordHr === null || hr > maxRecordHr) {
        maxRecordHr = hr;
      }
    }

    const rawCad =
      typeof rec.cadence === "number" && Number.isFinite(rec.cadence) && rec.cadence > 0
        ? rec.cadence +
          (typeof rec.fractionalCadence === "number" ? rec.fractionalCadence : 0)
        : null;
    if (rawCad !== null) {
      cadSum += rawCad;
      cadCount++;
    }

    const rawTemp =
      typeof rec.temperature === "number" && Number.isFinite(rec.temperature)
        ? rec.temperature
        : null;
    if (rawTemp !== null) {
      tempSum += rawTemp;
      tempCount++;
    }

    const distanceM =
      typeof rec.distance === "number" && Number.isFinite(rec.distance)
        ? rec.distance
        : null;

    const rawSpeed =
      typeof rec.enhancedSpeed === "number" && Number.isFinite(rec.enhancedSpeed)
        ? rec.enhancedSpeed
        : typeof rec.speed === "number" && Number.isFinite(rec.speed)
          ? rec.speed
          : null;
    const speedMs =
      rawSpeed !== null && rawSpeed >= 0 && rawSpeed <= FIT_MAX_VALID_SPEED_MS
        ? rawSpeed
        : null;

    const rawGpsAcc =
      typeof rec.gpsAccuracy === "number" &&
      Number.isFinite(rec.gpsAccuracy) &&
      rec.gpsAccuracy >= 0
        ? rec.gpsAccuracy
        : null;

    records.push({
      timestampMs,
      timestampIso: iso,
      distanceM,
      lat,
      lon,
      elevationM,
      heartRateBpm: hr,
      cadenceRaw: rawCad,
      temperatureC: rawTemp,
      speedMs,
      gpsAccuracyM: rawGpsAcc,
    });
  }

  for (let i = 1; i < records.length; i++) {
    if (records[i].timestampMs < records[i - 1].timestampMs) {
      records.sort((a, b) => a.timestampMs - b.timestampMs);
      break;
    }
  }

  // Classificação de modalidade
  const sportInfo = classifyFitSport(
    session.sport ?? lapMesgs[0]?.sport,
    session.subSport ?? lapMesgs[0]?.subSport
  );

  // Horário de início (session.startTime -> session.timestamp -> 1º lap.startTime -> 1º record.timestamp)
  const startedAt =
    parseFitDateToIso(session.startTime) ??
    parseFitDateToIso(lapMesgs[0]?.startTime) ??
    records[0]?.timestampIso ??
    parseFitDateToIso(session.timestamp);

  if (!startedAt) {
    throw new FitParseError(
      "NO_SESSION_DATA",
      "O arquivo .FIT não possui timestamp de início válido (startTime)."
    );
  }

  // Distância total em metros (session.totalDistance -> soma de lapMesgs -> último record.distance)
  const lapTotalDistanceM = lapMesgs.reduce(
    (acc, l) =>
      acc + (typeof l.totalDistance === "number" ? l.totalDistance : 0),
    0
  );
  const lastRecordDistanceM = records.reduce<number>(
    (last, r) => (r.distanceM !== null && r.distanceM >= 0 ? r.distanceM : last),
    0
  );

  const totalDistanceM =
    typeof session.totalDistance === "number" && session.totalDistance > 0
      ? session.totalDistance
      : lapTotalDistanceM > 0
        ? lapTotalDistanceM
        : lastRecordDistanceM;

  const distanceKm = Number((totalDistanceM / 1000).toFixed(3));
  if (totalDistanceM <= 0 || distanceKm <= 0) {
    throw new FitParseError(
      "ZERO_DISTANCE",
      "A distância total registrada no arquivo .FIT é zero."
    );
  }

  // Voltas válidas identificadas antecipadamente para distinguir auto-laps de 1 km de intervalados estruturados
  const validLaps = lapMesgs.filter(
    (l) =>
      typeof l.totalDistance === "number" &&
      l.totalDistance >= MIN_RESIDUAL_SPLIT_METERS &&
      typeof l.totalTimerTime === "number" &&
      l.totalTimerTime > 0
  );
  const uniform1KmAutoLaps = areLapsUniform1Km(validLaps);

  // Análise de movimento nos records e hierarquia de tempo (totalMovingTime -> auto-pause -> histerese mobile)
  const motionSteps = buildFitMotionSteps(records, sportInfo.kind);
  const motionSummary = summarizeFitMotion(motionSteps);
  const hasTimerPauseEvent = hasExplicitTimerPauseEvents(eventMesgs);

  const lapTotalTimerSec = lapMesgs.reduce(
    (acc, l) =>
      acc + (typeof l.totalTimerTime === "number" ? l.totalTimerTime : 0),
    0
  );
  const lapTotalElapsedSec = lapMesgs.reduce(
    (acc, l) =>
      acc +
      (typeof l.totalElapsedTime === "number"
        ? l.totalElapsedTime
        : typeof l.totalTimerTime === "number"
          ? l.totalTimerTime
          : 0),
    0
  );
  const recordSpanSec =
    records.length >= 2
      ? (records[records.length - 1].timestampMs - records[0].timestampMs) / 1000
      : 0;

  const rawTimerSec =
    typeof session.totalTimerTime === "number" && session.totalTimerTime > 0
      ? session.totalTimerTime
      : lapTotalTimerSec > 0
        ? lapTotalTimerSec
        : recordSpanSec;

  if (rawTimerSec <= 0) {
    throw new FitParseError(
      "ZERO_MOVING_TIME",
      "O tempo em movimento (totalTimerTime) registrado no arquivo .FIT é zero."
    );
  }

  const rawElapsedFloatSec =
    typeof session.totalElapsedTime === "number" && session.totalElapsedTime > 0
      ? session.totalElapsedTime
      : lapTotalElapsedSec > 0
        ? lapTotalElapsedSec
        : recordSpanSec > 0
          ? recordSpanSec
          : rawTimerSec;

  const sessionTotalMovingSec =
    typeof session.totalMovingTime === "number" &&
    Number.isFinite(session.totalMovingTime) &&
    session.totalMovingTime > 0 &&
    session.totalMovingTime <= rawElapsedFloatSec + 1
      ? session.totalMovingTime
      : null;

  const hasAnyLapMovingTime = lapMesgs.some((l) => isValidLapMovingTime(l));
  const lapTotalMovingSec = hasAnyLapMovingTime
    ? lapMesgs.reduce((acc, l) => acc + resolveLapMovingSec(l), 0)
    : 0;
  const validLapMovingSec =
    lapTotalMovingSec > 0 && lapTotalMovingSec <= rawElapsedFloatSec + 1
      ? lapTotalMovingSec
      : null;

  const explicitMovingSec = sessionTotalMovingSec ?? validLapMovingSec;
  const hasWatchAutoPause =
    rawElapsedFloatSec - rawTimerSec >= 2 || hasTimerPauseEvent;

  const canDetectPausesFromRecords =
    explicitMovingSec === null &&
    !hasWatchAutoPause &&
    Math.abs(rawElapsedFloatSec - rawTimerSec) < 2 &&
    motionSummary.isHighFrequency &&
    motionSummary.movingTimeSec >= 10 &&
    (validLaps.length <= 1 || uniform1KmAutoLaps);

  const detectedPausedSec =
    canDetectPausesFromRecords &&
    motionSummary.pausedTimeSec >= FIT_PAUSE_HYSTERESIS_MIN_SECONDS
      ? motionSummary.pausedTimeSec
      : 0;

  const rawMovingDurationSec =
    explicitMovingSec !== null
      ? explicitMovingSec
      : hasWatchAutoPause
        ? rawTimerSec
        : Math.max(1, rawTimerSec - detectedPausedSec);

  const durationSeconds = Math.round(rawMovingDurationSec);
  if (durationSeconds <= 0) {
    throw new FitParseError(
      "ZERO_MOVING_TIME",
      "O tempo em movimento (totalTimerTime) registrado no arquivo .FIT é zero."
    );
  }

  const rawElapsedSec = Math.round(rawElapsedFloatSec);
  const elapsedSeconds = Math.max(durationSeconds, rawElapsedSec);

  const speedKmh = Number(
    (distanceKm / (durationSeconds / 3600)).toFixed(2)
  );
  const paceSeconds = Math.max(1, Math.round(durationSeconds / distanceKm));
  const paceFormatted = formatPaceSeconds(paceSeconds);

  // Guarda de plausibilidade de velocidade média (2 a 25 km/h)
  if (
    speedKmh < MIN_AVG_MOVING_SPEED_KMH ||
    speedKmh > MAX_AVG_MOVING_SPEED_KMH
  ) {
    throw new FitParseError(
      "UNSUPPORTED_ACTIVITY",
      `Velocidade média no arquivo .FIT (${speedKmh.toFixed(1)} km/h) incompatível com corrida ou caminhada (faixa aceita: ${MIN_AVG_MOVING_SPEED_KMH} a ${MAX_AVG_MOVING_SPEED_KMH} km/h).`,
      { speedKmh }
    );
  }

  const warnings: FitWarning[] = [];

  if (detectedPausedSec >= 5) {
    warnings.push({
      code: "PAUSES_DETECTED_FROM_RECORDS",
      count: Math.round(detectedPausedSec),
      message: `Tempo parado (${Math.round(detectedPausedSec)}s) descontado automaticamente dos registros .FIT para cálculo do tempo em movimento.`,
    });
  }

  if (sportInfo.kind === "unknown") {
    warnings.push({
      code: "UNKNOWN_ACTIVITY_TYPE",
      message:
        "Modalidade não especificada ou genérica no arquivo .FIT; selecione a modalidade de treino manualmente.",
    });
  }

  const isIndoor = sportInfo.isIndoorSubSport || !hasGpsCoords;
  if (isIndoor) {
    warnings.push({
      code: "INDOOR_ACTIVITY_NO_GPS",
      message:
        "Treino indoor/esteira detectado (métricas extraídas diretamente do resumo oficial do dispositivo .FIT).",
    });
  }

  // Frequência Cardíaca (session -> fallback records)
  const avgHeartRate =
    sanitizeHeartRate(session.avgHeartRate) ??
    (hrCount > 0 ? sanitizeHeartRate(hrSum / hrCount) : null);

  const rawMaxHr =
    sanitizeHeartRate(session.maxHeartRate) ?? maxRecordHr ?? avgHeartRate;
  const maxHeartRate =
    avgHeartRate !== null && rawMaxHr !== null
      ? Math.max(avgHeartRate, rawMaxHr)
      : null;

  if (avgHeartRate === null) {
    warnings.push({
      code: "NO_HEART_RATE_DATA",
      message: "O arquivo .FIT não contém dados de frequência cardíaca.",
    });
  }

  // Cadência (session.avgRunningCadence ou session.avgCadence -> fallback records; ×2 se < 130 spm)
  const rawSessionCadBase =
    typeof session.avgRunningCadence === "number" && session.avgRunningCadence > 0
      ? session.avgRunningCadence
      : typeof session.avgCadence === "number" && session.avgCadence > 0
        ? session.avgCadence
        : null;

  const rawSessionFrac =
    typeof session.avgFractionalCadence === "number"
      ? session.avgFractionalCadence
      : 0;

  const rawAvgCad =
    rawSessionCadBase !== null
      ? rawSessionCadBase + rawSessionFrac
      : cadCount > 0
        ? cadSum / cadCount
        : null;

  let avgCadence: number | null = null;
  if (rawAvgCad !== null && rawAvgCad > 0) {
    if (rawAvgCad < CADENCE_SINGLE_FOOT_MAX) {
      avgCadence = Math.round(rawAvgCad * 2);
      warnings.push({
        code: "CADENCE_DOUBLED",
        message: `Cadência de um pé no .FIT (${Math.round(rawAvgCad)} rpm) convertida para passos por minuto totais (${avgCadence} spm).`,
      });
    } else {
      avgCadence = Math.round(rawAvgCad);
    }
  } else {
    warnings.push({
      code: "NO_CADENCE_DATA",
      message: "O arquivo .FIT não contém dados de cadência.",
    });
  }

  // Ganho de elevação (session.totalAscent -> fallback records via média móvel + histerese)
  const elevationGainM =
    typeof session.totalAscent === "number" && Number.isFinite(session.totalAscent)
      ? Math.round(session.totalAscent)
      : calculateElevationGain(records.map((r) => r.elevationM));

  if (elevationGainM === null) {
    warnings.push({
      code: "NO_ELEVATION_DATA",
      message: "O arquivo .FIT não contém ganho de elevação (totalAscent).",
    });
  }

  // Calorias ativas do dispositivo
  const activeCalories =
    typeof session.totalCalories === "number" &&
    Number.isFinite(session.totalCalories) &&
    session.totalCalories > 0
      ? Math.round(session.totalCalories)
      : null;

  // Temperatura média
  const avgTemperatureC =
    typeof session.avgTemperature === "number" &&
    Number.isFinite(session.avgTemperature)
      ? Number(session.avgTemperature.toFixed(1))
      : tempCount > 0
        ? Number((tempSum / tempCount).toFixed(1))
        : null;

  // Voltas (lapMesgs) e Parciais (splits)
  const laps: LapDetail[] = validLaps.map((l, idx) => {
    const distM = Math.round(l.totalDistance as number);
    const moveSec = resolveLapMovingSec(l);
    const durSec = Math.max(1, Math.round(moveSec));
    const paceSec = Math.max(
      1,
      Math.round(moveSec / ((l.totalDistance as number) / 1000))
    );
    return {
      lapNumber: idx + 1,
      distanceMeters: distM,
      durationSeconds: durSec,
      paceFormatted: formatPaceSeconds(paceSec),
    };
  });

  const shouldRebuildSplitsFromRecords =
    validLaps.length < 2 ||
    (uniform1KmAutoLaps && detectedPausedSec > 0 && motionSteps.length > 0);

  let splits: GpxSplit[] = [];

  if (!shouldRebuildSplitsFromRecords) {
    let cursorMs = parseFitDateToMs(startedAt);
    splits = validLaps.map((l, idx) => {
      const lapDistM = l.totalDistance as number;
      const lapMoveSec = resolveLapMovingSec(l);
      const lapWindowSec =
        typeof l.totalElapsedTime === "number" && l.totalElapsedTime > 0
          ? l.totalElapsedTime
          : lapMoveSec;
      const lapStartMs = parseFitDateToMs(l.startTime) ?? cursorMs;
      const lapEndMs =
        parseFitDateToMs(l.timestamp) ??
        (lapStartMs !== null ? lapStartMs + Math.round(lapWindowSec * 1000) : null);
      if (lapEndMs !== null) {
        cursorMs = lapEndMs;
      }

      const distKm = Math.min(1, Number((lapDistM / 1000).toFixed(3)));
      const durSec = Math.max(1, Math.round(lapMoveSec));
      const paceSec = Math.max(1, Math.round(lapMoveSec / (lapDistM / 1000)));
      const lapAscent =
        typeof l.totalAscent === "number" ? l.totalAscent : null;
      const lapDescent =
        typeof l.totalDescent === "number" ? l.totalDescent : 0;
      const rawEleDiff =
        lapAscent !== null
          ? Math.round(lapAscent - lapDescent)
          : computeLapElevationDiff(lapStartMs, lapEndMs, records);

      return {
        kilometer: idx + 1,
        distanceKm: distKm > 0 ? distKm : 0.01,
        durationSeconds: durSec,
        paceSeconds: paceSec,
        paceFormatted: formatPaceSeconds(paceSec),
        avgHeartRate: sanitizeHeartRate(l.avgHeartRate),
        elevationDiffM:
          rawEleDiff !== null && Object.is(rawEleDiff, -0) ? 0 : rawEleDiff,
      };
    });
  } else {
    splits = splitByDistance(motionStepsToSplitInputs(motionSteps));
    if (splits.length > 0) {
      warnings.push({
        code: "SPLITS_FROM_RECORDS",
        message:
          "Parciais por quilômetro geradas automaticamente a partir dos registros (recordMesgs) do arquivo .FIT.",
      });
    } else {
      splits = synthesizeSplitsFromSession(
        totalDistanceM,
        durationSeconds,
        avgHeartRate
      );
      if (splits.length > 0) {
        warnings.push({
          code: "SPLITS_SYNTHESIZED_FROM_SESSION",
          message:
            "Parciais por quilômetro estimadas proporcionalmente a partir do resumo da sessão .FIT.",
        });
      }
    }
  }

  // Nome opcional caso exista em workoutMesgs ou session
  const rawWorkoutName =
    typeof session.workoutName === "string"
      ? session.workoutName
      : typeof workoutMesgs[0]?.wktName === "string"
        ? workoutMesgs[0].wktName
        : null;
  const name = sanitizeActivityText(rawWorkoutName, 300);

  const externalId = computeFitExternalId(startedAt, distanceKm);
  const tafWindow = extractBestTafWindow(samplesFromFitRecords(records), {
    fallbackSummary: {
      durationSeconds,
      distanceMeters: totalDistanceM,
      avgHeartRate,
      maxHeartRate,
    },
  });

  return {
    source: "fit_upload",
    name,
    rawType: sportInfo.rawType,
    sport: sportInfo.sport,
    subSport: sportInfo.subSport,
    sourceActivityKind: sportInfo.kind,
    isIndoor,
    startedAt,
    distanceKm,
    durationSeconds,
    elapsedSeconds,
    speedKmh,
    paceSeconds,
    paceFormatted,
    avgHeartRate,
    maxHeartRate,
    avgCadence,
    elevationGainM,
    activeCalories,
    avgTemperatureC,
    splits,
    laps,
    tafWindow,
    externalId,
    pointCount: records.length,
    lapCount: validLaps.length,
    warnings,
  };
}

export const fitParserService = {
  isFitBuffer,
  semicirclesToDegrees,
  computeFitExternalId,
  parseFit,
};
