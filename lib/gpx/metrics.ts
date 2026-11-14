import {
  CADENCE_SINGLE_FOOT_MAX,
  GpxParseError,
  GpxSegment,
  GpxSourceActivityKind,
  GpxStepPair,
  GpxWarning,
  MAX_AVG_MOVING_SPEED_KMH,
  MAX_VALID_HEART_RATE,
  MIN_AVG_MOVING_SPEED_KMH,
  MIN_VALID_HEART_RATE,
} from "./types";

/**
 * Formata um pace em segundos por quilômetro como string "m:ss" (ex.: 300 -> "5:00", 275 -> "4:35").
 */
export function formatPaceSeconds(paceSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(paceSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface ComputedGpxMetrics {
  startedAt: string;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  elapsedSeconds: number;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  avgTemperatureC: number | null;
  warnings: GpxWarning[];
}

/**
 * Calcula distância total, tempo em movimento, tempo decorrido, velocidade média,
 * pace e médias de sensores (FC em movimento, FC máx global, cadência em movimento com regra ×2, temperatura).
 * Não lê nem expõe nenhum dado calórico (D8).
 */
export function computeGpxMetrics(
  segments: GpxSegment[],
  pairs: GpxStepPair[],
  sourceActivityKind: GpxSourceActivityKind
): ComputedGpxMetrics {
  const allPoints = segments.flatMap((s) => s.points);
  if (allPoints.length < 2 || pairs.length === 0) {
    throw new GpxParseError(
      "ZERO_DISTANCE",
      "O arquivo .GPX não possui pontos suficientes em movimento para calcular distância e ritmo."
    );
  }

  const firstPoint = allPoints[0];
  const lastPoint = allPoints[allPoints.length - 1];
  const startedAt = firstPoint.timestampIso;

  let totalStepDistanceMeters = 0;
  let movingDistanceMeters = 0;
  let movingTimeSecondsFloat = 0;

  let hrWeightedSum = 0;
  let hrMovingSeconds = 0;
  let maxHeartRate: number | null = null;

  let cadWeightedSum = 0;
  let cadMovingSeconds = 0;

  const acceptedPoints = [];
  let lastSegIdx = -1;
  for (const pair of pairs) {
    if (pair.segmentIndex !== lastSegIdx) {
      acceptedPoints.push(pair.from);
      lastSegIdx = pair.segmentIndex;
    }
    acceptedPoints.push(pair.to);
  }

  for (const pt of acceptedPoints) {
    if (
      pt.heartRateBpm !== null &&
      pt.heartRateBpm >= MIN_VALID_HEART_RATE &&
      pt.heartRateBpm <= MAX_VALID_HEART_RATE
    ) {
      if (maxHeartRate === null || pt.heartRateBpm > maxHeartRate) {
        maxHeartRate = pt.heartRateBpm;
      }
    }
  }

  for (const pair of pairs) {
    totalStepDistanceMeters += pair.deltaDistanceM;
    movingTimeSecondsFloat += pair.movingTimeSeconds;

    if (pair.isMoving && pair.movingTimeSeconds > 0) {
      movingDistanceMeters += pair.deltaDistanceM;

      const pairHr = pair.to.heartRateBpm ?? pair.from.heartRateBpm;
      if (
        pairHr !== null &&
        pairHr >= MIN_VALID_HEART_RATE &&
        pairHr <= MAX_VALID_HEART_RATE
      ) {
        hrWeightedSum += pairHr * pair.movingTimeSeconds;
        hrMovingSeconds += pair.movingTimeSeconds;
      }

      const pairCad = pair.to.cadenceRaw ?? pair.from.cadenceRaw;
      if (pairCad !== null && pairCad > 0) {
        cadWeightedSum += pairCad * pair.movingTimeSeconds;
        cadMovingSeconds += pair.movingTimeSeconds;
      }
    }
  }

  if (totalStepDistanceMeters <= 0 || Number((totalStepDistanceMeters / 1000).toFixed(3)) <= 0) {
    throw new GpxParseError(
      "ZERO_DISTANCE",
      "A distância total calculada no arquivo .GPX é zero."
    );
  }

  const durationSeconds = Math.round(movingTimeSecondsFloat);
  if (durationSeconds <= 0) {
    throw new GpxParseError(
      "ZERO_MOVING_TIME",
      "O tempo em movimento calculado no arquivo .GPX é zero."
    );
  }

  const distanceMeters =
    movingDistanceMeters > 0 ? movingDistanceMeters : totalStepDistanceMeters;
  const distanceKm = Number((distanceMeters / 1000).toFixed(3));

  const rawElapsedSeconds = Math.round(
    (lastPoint.timestampMs - firstPoint.timestampMs) / 1000
  );
  const elapsedSeconds = Math.max(durationSeconds, rawElapsedSeconds);

  const exactDistanceKm = distanceMeters / 1000;
  const speedKmh = Number(
    (exactDistanceKm / (durationSeconds / 3600)).toFixed(2)
  );
  const paceSeconds = Math.round(durationSeconds / exactDistanceKm);
  const paceFormatted = formatPaceSeconds(paceSeconds);

  // Guarda de plausibilidade de velocidade média (2 a 25 km/h — D5)
  if (
    speedKmh < MIN_AVG_MOVING_SPEED_KMH ||
    speedKmh > MAX_AVG_MOVING_SPEED_KMH
  ) {
    throw new GpxParseError(
      "UNSUPPORTED_ACTIVITY",
      `Velocidade média em movimento (${speedKmh.toFixed(1)} km/h) incompatível com corrida ou caminhada (faixa aceita: ${MIN_AVG_MOVING_SPEED_KMH} a ${MAX_AVG_MOVING_SPEED_KMH} km/h).`,
      { speedKmh }
    );
  }

  const warnings: GpxWarning[] = [];

  const avgHeartRate =
    hrMovingSeconds > 0 ? Math.round(hrWeightedSum / hrMovingSeconds) : null;
  if (avgHeartRate === null) {
    warnings.push({
      code: "NO_HEART_RATE_DATA",
      message: "O arquivo .GPX não contém dados de frequência cardíaca (<hr>).",
    });
  }

  let avgCadence: number | null = null;
  if (cadMovingSeconds > 0) {
    const rawAvgCadence = cadWeightedSum / cadMovingSeconds;
    const isFootActivity =
      sourceActivityKind === "run" ||
      sourceActivityKind === "walk" ||
      sourceActivityKind === "unknown";

    if (isFootActivity && rawAvgCadence < CADENCE_SINGLE_FOOT_MAX) {
      avgCadence = Math.round(rawAvgCadence * 2);
      warnings.push({
        code: "CADENCE_DOUBLED",
        message: `Cadência original de um pé (${Math.round(rawAvgCadence)} rpm) convertida para passos por minuto totais (${avgCadence} spm).`,
      });
    } else {
      avgCadence = Math.round(rawAvgCadence);
    }
  } else {
    warnings.push({
      code: "NO_CADENCE_DATA",
      message: "O arquivo .GPX não contém dados de cadência (<cad>).",
    });
  }

  let tempSum = 0;
  let tempCount = 0;
  for (const pt of acceptedPoints) {
    if (pt.temperatureC !== null) {
      tempSum += pt.temperatureC;
      tempCount++;
    }
  }
  const avgTemperatureC =
    tempCount > 0 ? Number((tempSum / tempCount).toFixed(1)) : null;

  return {
    startedAt,
    distanceMeters,
    distanceKm,
    durationSeconds,
    elapsedSeconds,
    speedKmh,
    paceSeconds,
    paceFormatted,
    avgHeartRate,
    maxHeartRate: avgHeartRate !== null ? maxHeartRate : null,
    avgCadence,
    avgTemperatureC,
    warnings,
  };
}
