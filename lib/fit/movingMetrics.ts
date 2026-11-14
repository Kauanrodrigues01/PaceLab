/**
 * Helpers puros de análise de movimento, detecção de pausas com histerese temporal,
 * reconstrução de parciais e cálculo de elevação por volta para arquivos .FIT.
 */

import { computeSplitElevationDiff, smoothElevations } from "../gpx/elevation";
import { haversineDistanceMeters } from "../gpx/geo";
import type { DistanceSplitInput } from "../gpx/splits";
import type { GpxSourceActivityKind } from "../gpx/types";
import {
  FIT_MAX_GPS_ACCURACY_METERS,
  FIT_MAX_VALID_SPEED_MS,
  FIT_PAUSE_HYSTERESIS_MIN_SECONDS,
  FIT_STOP_SPEED_THRESHOLD_RUN_MS,
  FIT_STOP_SPEED_THRESHOLD_WALK_MS,
  FitRecordPoint,
} from "./types";

export interface FitMotionStep {
  deltaDistM: number;
  deltaTimeSec: number;
  isCandidateStop: boolean;
  isMoving: boolean;
  hr: number | null;
  eleFrom: number | null;
  eleTo: number | null;
}

export interface FitMotionSummary {
  totalTimeSec: number;
  movingTimeSec: number;
  pausedTimeSec: number;
  medianDtSec: number;
  isHighFrequency: boolean;
}

interface DistanceAnnotatedRecord {
  record: FitRecordPoint;
  cumDistM: number;
}

export interface MotionSplitOptions {
  /** Quando true (padrão), remove intervalos de pausa real mantendo a distância acumulada íntegra. */
  filterPauses?: boolean;
}

const UNIFORM_AUTO_LAP_METERS = 1000;
const UNIFORM_AUTO_LAP_TOLERANCE_M = 50;
const HIGH_FREQUENCY_MAX_MEDIAN_DT_SEC = 5;
const MIN_HIGH_FREQUENCY_STEPS = 9;

function parseEventTimestampMs(val: unknown): number | null {
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof val === "string" || typeof val === "number") {
    const ms = Date.parse(String(val));
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Verifica se `eventMesgs` registra parada/pausa intermediária de cronômetro
 * (`stop` seguido de retomada `start`, ou múltiplos eventos `timer` `stop`/`stopAll`),
 * ignorando o único `timer/stop` normal do encerramento da atividade.
 */
export function hasExplicitTimerPauseEvents(
  eventMesgs: Array<Record<string, unknown>>
): boolean {
  const timerEvents = eventMesgs
    .map((ev, idx) => {
      const rawEvent = ev.event;
      const rawEventType = ev.eventType;
      const evName =
        typeof rawEvent === "string" ? rawEvent.trim().toLowerCase() : rawEvent;
      const evType =
        typeof rawEventType === "string"
          ? rawEventType.trim().toLowerCase()
          : rawEventType;
      return {
        idx,
        tsMs: parseEventTimestampMs(ev.timestamp),
        isTimer: evName === "timer" || evName === 0,
        evType,
      };
    })
    .filter((e) => e.isTimer)
    .sort((a, b) => {
      if (a.tsMs !== null && b.tsMs !== null && a.tsMs !== b.tsMs) {
        return a.tsMs - b.tsMs;
      }
      return a.idx - b.idx;
    });

  let stopCount = 0;
  let resumedAfterStop = false;

  for (const ev of timerEvents) {
    if (
      ev.evType === "stop" ||
      ev.evType === "stopall" ||
      ev.evType === "stop_all"
    ) {
      stopCount++;
    } else if (ev.evType === "start" && stopCount > 0) {
      resumedAfterStop = true;
    }
  }

  return stopCount >= 2 || resumedAfterStop;
}

/**
 * Consolida múltiplos `FitRecordPoint` no mesmo `timestampMs` em um único ponto completo.
 * Apps móveis (ex.: Strava Android) alternam uma mensagem GPS/velocidade/elevação e outra
 * só com odômetro (`distance`) para o mesmo segundo; sem essa mesclagem, metade dos sensores se perde.
 */
export function coalesceFitRecordsByTimestamp(
  records: FitRecordPoint[]
): FitRecordPoint[] {
  if (records.length <= 1) {
    return records;
  }

  let isSorted = true;
  for (let i = 1; i < records.length; i++) {
    if (records[i].timestampMs < records[i - 1].timestampMs) {
      isSorted = false;
      break;
    }
  }
  const ordered = isSorted
    ? records
    : [...records].sort((a, b) => a.timestampMs - b.timestampMs);

  let hasDuplicateTimestamp = false;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].timestampMs === ordered[i - 1].timestampMs) {
      hasDuplicateTimestamp = true;
      break;
    }
  }
  if (!hasDuplicateTimestamp) {
    return ordered;
  }

  const merged: FitRecordPoint[] = [];
  for (const rec of ordered) {
    const last = merged[merged.length - 1];
    if (!last || last.timestampMs !== rec.timestampMs) {
      merged.push({ ...rec });
      continue;
    }

    if (rec.distanceM !== null && Number.isFinite(rec.distanceM)) {
      last.distanceM =
        last.distanceM === null
          ? rec.distanceM
          : Math.max(last.distanceM, rec.distanceM);
    }
    if (rec.lat !== null && rec.lon !== null) {
      last.lat = rec.lat;
      last.lon = rec.lon;
    }
    if (rec.elevationM !== null) last.elevationM = rec.elevationM;
    if (rec.heartRateBpm !== null) last.heartRateBpm = rec.heartRateBpm;
    if (rec.cadenceRaw !== null) last.cadenceRaw = rec.cadenceRaw;
    if (rec.temperatureC !== null) last.temperatureC = rec.temperatureC;
    if (rec.speedMs !== null && rec.speedMs !== undefined) {
      last.speedMs = rec.speedMs;
    }
    if (rec.gpsAccuracyM !== null && rec.gpsAccuracyM !== undefined) {
      last.gpsAccuracyM = rec.gpsAccuracyM;
    }
  }

  return merged;
}

function resolveCumulativeRecordDistances(
  records: FitRecordPoint[]
): DistanceAnnotatedRecord[] {
  const normalizedRecords = coalesceFitRecordsByTimestamp(records);
  const withOdometer = normalizedRecords.filter(
    (r): r is FitRecordPoint & { distanceM: number } =>
      typeof r.distanceM === "number" &&
      Number.isFinite(r.distanceM) &&
      r.distanceM >= 0
  );

  if (withOdometer.length >= 2) {
    return withOdometer.map((record) => ({
      record,
      cumDistM: record.distanceM,
    }));
  }

  const withGps = normalizedRecords.filter(
    (r): r is FitRecordPoint & { lat: number; lon: number } =>
      r.lat !== null &&
      r.lon !== null &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lon)
  );

  if (withGps.length < 2) {
    return [];
  }

  const series: DistanceAnnotatedRecord[] = [{ record: withGps[0], cumDistM: 0 }];
  let cumDistM = 0;
  let anchor = withGps[0];

  for (let i = 1; i < withGps.length; i++) {
    const cur = withGps[i];
    const dt = (cur.timestampMs - anchor.timestampMs) / 1000;
    if (dt <= 0) continue;

    const segDist = haversineDistanceMeters(anchor.lat, anchor.lon, cur.lat, cur.lon);
    if (!Number.isFinite(segDist) || segDist / dt > FIT_MAX_VALID_SPEED_MS) {
      continue;
    }

    cumDistM += segDist;
    series.push({ record: cur, cumDistM });
    anchor = cur;
  }

  return series;
}

function resolveEffectiveStepSpeedMs(
  cur: FitRecordPoint,
  deltaDistM: number,
  deltaTimeSec: number,
  stopThresholdMs: number
): number {
  const validDeviceSpeedMs =
    cur.speedMs != null &&
    Number.isFinite(cur.speedMs) &&
    cur.speedMs >= 0 &&
    cur.speedMs <= FIT_MAX_VALID_SPEED_MS
      ? cur.speedMs
      : null;

  const derivedSpeedMs =
    deltaDistM > 0 && deltaTimeSec > 0 ? deltaDistM / deltaTimeSec : 0;
  const validDerivedSpeedMs =
    derivedSpeedMs <= FIT_MAX_VALID_SPEED_MS ? derivedSpeedMs : 0;
  const hasBadGps =
    cur.gpsAccuracyM != null && cur.gpsAccuracyM > FIT_MAX_GPS_ACCURACY_METERS;

  if (validDeviceSpeedMs !== null) {
    // Mesmo quando o odômetro permanece plano por 1-3s entre atualizações em degraus,
    // preservamos a velocidade real do sensor (e aproveitamos velocidade derivada quando dt >= 3s e GPS válido).
    const baseSpeed =
      validDeviceSpeedMs > 0 &&
      deltaTimeSec >= 3 &&
      !hasBadGps &&
      validDerivedSpeedMs > validDeviceSpeedMs
        ? validDerivedSpeedMs
        : validDeviceSpeedMs;
    if (hasBadGps && baseSpeed < stopThresholdMs * 1.5) {
      return 0;
    }
    return baseSpeed;
  }

  if (deltaDistM <= 0) {
    return 0;
  }
  if (hasBadGps && validDerivedSpeedMs < stopThresholdMs * 1.5) {
    return 0;
  }
  return validDerivedSpeedMs;
}

function applyStopHysteresis(steps: FitMotionStep[]): void {
  let runStart = -1;
  let runDuration = 0;

  for (let i = 0; i <= steps.length; i++) {
    const isCandidate = i < steps.length && steps[i].isCandidateStop;
    if (isCandidate) {
      if (runStart === -1) {
        runStart = i;
        runDuration = 0;
      }
      runDuration += steps[i].deltaTimeSec;
      continue;
    }

    if (runStart !== -1) {
      const isSustainedPause = runDuration >= FIT_PAUSE_HYSTERESIS_MIN_SECONDS;
      for (let j = runStart; j < i; j++) {
        steps[j].isMoving = !isSustainedPause;
      }
      runStart = -1;
      runDuration = 0;
    }
  }
}

/**
 * Constrói passos cronológicos a partir de `recordMesgs`, aplicando limiar por modalidade
 * e histerese temporal (>= 3s) para distinguir pausas reais de oscilações momentâneas de GPS.
 */
export function buildFitMotionSteps(
  records: FitRecordPoint[],
  kind: GpxSourceActivityKind
): FitMotionStep[] {
  const series = resolveCumulativeRecordDistances(records);
  if (series.length < 2) {
    return [];
  }

  const stopThresholdMs =
    kind === "walk"
      ? FIT_STOP_SPEED_THRESHOLD_WALK_MS
      : FIT_STOP_SPEED_THRESHOLD_RUN_MS;

  const steps: FitMotionStep[] = [];
  let anchor = series[0];

  for (let i = 1; i < series.length; i++) {
    const cur = series[i];
    const deltaTimeSec = (cur.record.timestampMs - anchor.record.timestampMs) / 1000;
    if (deltaTimeSec <= 0) continue;

    const rawDeltaDist = cur.cumDistM - anchor.cumDistM;
    const deltaDistM = rawDeltaDist > 0 ? rawDeltaDist : 0;
    const effectiveSpeedMs = resolveEffectiveStepSpeedMs(
      cur.record,
      deltaDistM,
      deltaTimeSec,
      stopThresholdMs
    );
    const hasActiveCadence =
      cur.record.cadenceRaw !== null && cur.record.cadenceRaw > 0;
    const isCandidateStop = effectiveSpeedMs < stopThresholdMs && !hasActiveCadence;

    steps.push({
      deltaDistM,
      deltaTimeSec,
      isCandidateStop,
      isMoving: true,
      hr: cur.record.heartRateBpm ?? anchor.record.heartRateBpm,
      eleFrom: anchor.record.elevationM,
      eleTo: cur.record.elevationM,
    });
    anchor = cur;
  }

  applyStopHysteresis(steps);
  return steps;
}

/** Resume tempo total, tempo em movimento, tempo em pausa e frequência amostral dos passos. */
export function summarizeFitMotion(steps: FitMotionStep[]): FitMotionSummary {
  if (steps.length === 0) {
    return {
      totalTimeSec: 0,
      movingTimeSec: 0,
      pausedTimeSec: 0,
      medianDtSec: 0,
      isHighFrequency: false,
    };
  }

  let totalTimeSec = 0;
  let movingTimeSec = 0;
  const dts: number[] = [];

  for (const step of steps) {
    totalTimeSec += step.deltaTimeSec;
    if (step.isMoving) {
      movingTimeSec += step.deltaTimeSec;
    }
    dts.push(step.deltaTimeSec);
  }

  dts.sort((a, b) => a - b);
  const medianDtSec = dts[Math.floor(dts.length / 2)] ?? 0;

  return {
    totalTimeSec,
    movingTimeSec,
    pausedTimeSec: Math.max(0, totalTimeSec - movingTimeSec),
    medianDtSec,
    isHighFrequency:
      steps.length >= MIN_HIGH_FREQUENCY_STEPS &&
      medianDtSec > 0 &&
      medianDtSec <= HIGH_FREQUENCY_MAX_MEDIAN_DT_SEC,
  };
}

/**
 * Converte `FitMotionStep[]` no contrato aceito por `splitByDistance`,
 * preservando ticks isolados (`< 3s`) com `deltaDistM === 0` anexando-os ao passo em movimento adjacente
 * e removendo integralmente intervalos de pausa real (`isMoving === false`).
 */
export function motionStepsToSplitInputs(
  steps: FitMotionStep[],
  options: MotionSplitOptions = {}
): DistanceSplitInput[] {
  const filterPauses = options.filterPauses !== false;
  const inputs: DistanceSplitInput[] = [];
  let carriedZeroDistTimeSec = 0;
  let carriedPausedDistM = 0;

  for (const step of steps) {
    if (filterPauses && !step.isMoving) {
      if (carriedZeroDistTimeSec > 0 && inputs.length > 0) {
        inputs[inputs.length - 1].movingTimeSeconds += carriedZeroDistTimeSec;
        carriedZeroDistTimeSec = 0;
      }
      if (step.deltaDistM > 0) {
        carriedPausedDistM += step.deltaDistM;
      }
      continue;
    }

    if (step.deltaTimeSec <= 0) {
      if (step.deltaDistM > 0) {
        carriedPausedDistM += step.deltaDistM;
      }
      continue;
    }

    if (step.deltaDistM <= 0) {
      carriedZeroDistTimeSec += step.deltaTimeSec;
      continue;
    }

    const combinedDist = step.deltaDistM + carriedPausedDistM;
    const combinedTime = step.deltaTimeSec + carriedZeroDistTimeSec;
    carriedPausedDistM = 0;
    carriedZeroDistTimeSec = 0;

    inputs.push({
      deltaDistanceM: combinedDist,
      movingTimeSeconds: combinedTime,
      isMoving: true,
      from: {
        elevationM: step.eleFrom,
        heartRateBpm: step.hr,
      },
      to: {
        elevationM: step.eleTo,
        heartRateBpm: step.hr,
      },
    });
  }

  if (carriedPausedDistM > 0 && inputs.length > 0) {
    inputs[inputs.length - 1].deltaDistanceM += carriedPausedDistM;
  }
  if (carriedZeroDistTimeSec > 0 && inputs.length > 0) {
    inputs[inputs.length - 1].movingTimeSeconds += carriedZeroDistTimeSec;
  }

  return inputs;
}

/**
 * Verifica se múltiplas voltas representam auto-laps uniformes de ~1 km (+ parcial final residual)
 * sem `totalMovingTime` próprio divergente (típico de exports móveis sem auto-pause).
 */
export function areLapsUniform1Km(
  validLaps: Array<Record<string, unknown>>
): boolean {
  if (validLaps.length < 2) return false;

  const hasPerLapMovingTime = validLaps.some(
    (l) =>
      typeof l.totalMovingTime === "number" &&
      typeof l.totalTimerTime === "number" &&
      l.totalMovingTime > 0 &&
      l.totalTimerTime - l.totalMovingTime >= 1
  );
  if (hasPerLapMovingTime) {
    return false;
  }

  const headLaps = validLaps.slice(0, -1);
  const allHeadNear1Km = headLaps.every(
    (l) =>
      typeof l.totalDistance === "number" &&
      Math.abs(l.totalDistance - UNIFORM_AUTO_LAP_METERS) <= UNIFORM_AUTO_LAP_TOLERANCE_M
  );
  if (!allHeadNear1Km) {
    return false;
  }

  const lastDist = validLaps[validLaps.length - 1]?.totalDistance;
  return (
    typeof lastDist === "number" &&
    lastDist <= UNIFORM_AUTO_LAP_METERS + UNIFORM_AUTO_LAP_TOLERANCE_M
  );
}

/**
 * Calcula a variação líquida de elevação (`computeSplitElevationDiff`) para uma volta `lapMesg`
 * a partir dos `recordMesgs` situados dentro de sua janela temporal `[lapStartMs, lapEndMs]`.
 */
export function computeLapElevationDiff(
  lapStartMs: number | null,
  lapEndMs: number | null,
  records: FitRecordPoint[]
): number | null {
  if (lapStartMs === null || lapEndMs === null || lapEndMs < lapStartMs) {
    return null;
  }

  const elevations = records
    .filter(
      (r): r is FitRecordPoint & { elevationM: number } =>
        r.elevationM !== null &&
        r.timestampMs >= lapStartMs &&
        r.timestampMs <= lapEndMs
    )
    .map((r) => r.elevationM);

  if (elevations.length < 2) {
    return null;
  }

  const series = elevations.length >= 5 ? smoothElevations(elevations) : elevations;
  return computeSplitElevationDiff(series[0], series[series.length - 1]);
}
