import {
  EARTH_RADIUS_METERS,
  GPS_SLOW_JITTER_EMA_ALPHA,
  GPS_SLOW_JITTER_MAX_DT_SECONDS,
  GPS_SLOW_JITTER_MAX_SPEED_MS,
  GPS_SLOW_JITTER_MIN_POINTS,
  GpxSegment,
  GpxStepPair,
  GpxTrackPoint,
  GpxWarning,
  MAX_SPEED_SPIKE_MS,
  MOVING_SPEED_THRESHOLD_RUN_MS,
} from "./types";

const DEG_TO_RAD = Math.PI / 180;

/**
 * Calcula a distância geodésica em metros entre dois pontos (lat1, lon1) e (lat2, lon2)
 * usando a fórmula de Haversine com raio terrestre R = 6.371.000 m.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLambda = (lon2 - lon1) * DEG_TO_RAD;
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;

  const sinDPhiHalf = Math.sin(dPhi / 2);
  const sinDLambdaHalf = Math.sin(dLambda / 2);

  const a =
    sinDPhiHalf * sinDPhiHalf +
    Math.cos(phi1) * Math.cos(phi2) * sinDLambdaHalf * sinDLambdaHalf;

  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_METERS * c;
}

export interface BuildSegmentStepPairsOptions {
  movingSpeedThresholdMs?: number;
  maxSpikeSpeedMs?: number;
}

export interface BuildSegmentStepPairsResult {
  pairs: GpxStepPair[];
  totalPairsEvaluated: number;
  discardedNonPositiveDeltaCount: number;
  discardedSpikeCount: number;
  stationaryPairsCount: number;
  movingPairsCount: number;
  warnings: GpxWarning[];
}

/**
 * Constrói os pares consecutivos válidos exclusivamente dentro de cada `<trkseg>`,
 * filtrando saltos de tempo não-positivos (Δt <= 0) e spikes de GPS (v > maxSpikeSpeedMs),
 * mantendo o último ponto válido como âncora para evitar inflar ou perder distância.
 */
export function buildSegmentStepPairs(
  segments: GpxSegment[],
  options?: BuildSegmentStepPairsOptions
): BuildSegmentStepPairsResult {
  const movingSpeedThresholdMs =
    options?.movingSpeedThresholdMs ?? MOVING_SPEED_THRESHOLD_RUN_MS;
  const maxSpikeSpeedMs = options?.maxSpikeSpeedMs ?? MAX_SPEED_SPIKE_MS;

  const pairs: GpxStepPair[] = [];
  let totalPairsEvaluated = 0;
  let discardedNonPositiveDeltaCount = 0;
  let discardedSpikeCount = 0;
  let stationaryPairsCount = 0;
  let movingPairsCount = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const pts = segments[segIdx].points;
    if (pts.length < 2) continue;

    // Passo 1: Filtra Δt <= 0 e spikes de GPS (> maxSpikeSpeedMs) mantendo a âncora válida
    const cleanPts: GpxTrackPoint[] = [pts[0]];
    const rawStepDt: number[] = [0];
    const rawStepSpeed: number[] = [0];
    let anchor = pts[0];

    for (let i = 1; i < pts.length; i++) {
      const candidate = pts[i];
      totalPairsEvaluated++;

      const deltaTimeSeconds =
        (candidate.timestampMs - anchor.timestampMs) / 1000;

      if (deltaTimeSeconds <= 0) {
        discardedNonPositiveDeltaCount++;
        continue;
      }

      const rawDistanceM = haversineDistanceMeters(
        anchor.lat,
        anchor.lon,
        candidate.lat,
        candidate.lon
      );

      const rawSpeedMs = rawDistanceM / deltaTimeSeconds;

      if (rawSpeedMs > maxSpikeSpeedMs) {
        discardedSpikeCount++;
        continue;
      }

      cleanPts.push(candidate);
      rawStepDt.push(deltaTimeSeconds);
      rawStepSpeed.push(rawSpeedMs);
      anchor = candidate;
    }

    if (cleanPts.length < 2) continue;

    // Passo 2: Suavização adaptativa de coordenadas (Zero-Phase Forward-Backward EMA)
    // Atua apenas em trilhas contínuas (>= 10 pontos) e exclusivamente em passos de alta
    // frequência (Δt <= 3s) em regime de caminhada lenta (v < 1,60 m/s), eliminando o
    // zig-zag lateral do GPS 1Hz sem afetar trajetórias retilíneas ou velocidades de corrida.
    const n = cleanPts.length;
    const smoothedLat = cleanPts.map((p) => p.lat);
    const smoothedLon = cleanPts.map((p) => p.lon);

    if (n >= GPS_SLOW_JITTER_MIN_POINTS) {
      const fwdLat = [...smoothedLat];
      const fwdLon = [...smoothedLon];

      for (let i = 1; i < n; i++) {
        const isSlowHighFreq =
          rawStepDt[i] <= GPS_SLOW_JITTER_MAX_DT_SECONDS &&
          rawStepSpeed[i] < GPS_SLOW_JITTER_MAX_SPEED_MS;
        const alpha = isSlowHighFreq ? GPS_SLOW_JITTER_EMA_ALPHA : 1.0;
        fwdLat[i] = alpha * cleanPts[i].lat + (1 - alpha) * fwdLat[i - 1];
        fwdLon[i] = alpha * cleanPts[i].lon + (1 - alpha) * fwdLon[i - 1];
      }

      smoothedLat[n - 1] = fwdLat[n - 1];
      smoothedLon[n - 1] = fwdLon[n - 1];

      for (let i = n - 2; i >= 0; i--) {
        const isSlowHighFreq =
          rawStepDt[i + 1] <= GPS_SLOW_JITTER_MAX_DT_SECONDS &&
          rawStepSpeed[i + 1] < GPS_SLOW_JITTER_MAX_SPEED_MS;
        const alpha = isSlowHighFreq ? GPS_SLOW_JITTER_EMA_ALPHA : 1.0;
        smoothedLat[i] = alpha * fwdLat[i] + (1 - alpha) * smoothedLat[i + 1];
        smoothedLon[i] = alpha * fwdLon[i] + (1 - alpha) * smoothedLon[i + 1];
      }
    }

    for (let i = 1; i < n; i++) {
      const fromPt = cleanPts[i - 1];
      const toPt = cleanPts[i];
      const deltaTimeSeconds = rawStepDt[i];
      const rawSpeedMs = rawStepSpeed[i];

      const smoothedDistanceM = haversineDistanceMeters(
        smoothedLat[i - 1],
        smoothedLon[i - 1],
        smoothedLat[i],
        smoothedLon[i]
      );

      const isMoving = rawSpeedMs >= movingSpeedThresholdMs;
      const movingTimeSeconds = isMoving ? deltaTimeSeconds : 0;
      const speedMs = smoothedDistanceM / deltaTimeSeconds;

      if (isMoving) {
        movingPairsCount++;
      } else {
        stationaryPairsCount++;
      }

      pairs.push({
        segmentIndex: segIdx,
        from: fromPt,
        to: toPt,
        deltaDistanceM: smoothedDistanceM,
        deltaTimeSeconds,
        speedMs,
        isMoving,
        movingTimeSeconds,
      });
    }
  }

  const warnings: GpxWarning[] = [];

  if (discardedNonPositiveDeltaCount > 0) {
    warnings.push({
      code: "NON_POSITIVE_DELTA_TIME_SKIPPED",
      message: `${discardedNonPositiveDeltaCount} par(es) com intervalo de tempo nulo ou regressivo (Δt <= 0) foram descartados.`,
      count: discardedNonPositiveDeltaCount,
    });
  }

  if (discardedSpikeCount > 0) {
    warnings.push({
      code: "GPS_SPIKE_SKIPPED",
      message: `${discardedSpikeCount} ponto(s) com salto anormal de GPS (> ${maxSpikeSpeedMs} m/s) foram descartados.`,
      count: discardedSpikeCount,
    });
  }

  return {
    pairs,
    totalPairsEvaluated,
    discardedNonPositiveDeltaCount,
    discardedSpikeCount,
    stationaryPairsCount,
    movingPairsCount,
    warnings,
  };
}
