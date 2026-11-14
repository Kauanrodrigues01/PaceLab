/**
 * Extrator puro da melhor janela contínua de 12 minutos (720s) para Simulado TAF (Teste de Cooper).
 * Opera tanto sobre records de arquivos .FIT quanto sobre pares de passos de arquivos .GPX,
 * com fallback proporcional quando o arquivo contém apenas resumo da sessão.
 */

import type { LapDetail, TafWindowSummary } from "@/types";
import { FIT_MAX_VALID_SPEED_MS, type FitRecordPoint } from "../fit/types";
import { haversineDistanceMeters } from "../gpx/geo";
import { formatPaceSeconds } from "../gpx/metrics";
import {
  GpxStepPair,
  MAX_VALID_HEART_RATE,
  MIN_RESIDUAL_SPLIT_METERS,
  MIN_VALID_HEART_RATE,
} from "../gpx/types";

export const DEFAULT_TAF_WINDOW_SECONDS = 720;
export const DEFAULT_TAF_LAP_METERS = 400;
const SHORT_WINDOW_TOLERANCE_SECONDS = 5;

export interface WindowSample {
  /** Tempo decorrido contínuo (wall-clock) desde o início da atividade, em segundos. */
  elapsedSec: number;
  /** Distância acumulada não-decrescente desde o início da atividade, em metros. */
  distanceM: number;
  /** Frequência cardíaca instantânea válida (30..250 bpm) ou null. */
  heartRateBpm: number | null;
}

export interface ExtractTafWindowOptions {
  targetDurationSeconds?: number;
  lapDistanceMeters?: number;
  fallbackSummary?: {
    durationSeconds: number;
    distanceMeters: number;
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
  };
}

function normalizeValidHr(hr: number | null | undefined): number | null {
  if (typeof hr !== "number" || !Number.isFinite(hr)) return null;
  const rounded = Math.round(hr);
  if (rounded < MIN_VALID_HEART_RATE || rounded > MAX_VALID_HEART_RATE) {
    return null;
  }
  return rounded;
}

/**
 * Converte records cronológicos de um arquivo .FIT em uma série monotônica de tempo e distância.
 * Usa o odômetro nativo (`distanceM`) quando disponível e recorre ao Haversine caso ausente.
 */
export function samplesFromFitRecords(records: FitRecordPoint[]): WindowSample[] {
  if (!records || records.length === 0) return [];

  const validRecords = records
    .filter((r) => Number.isFinite(r.timestampMs))
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (validRecords.length === 0) return [];

  const baseTs = validRecords[0].timestampMs;
  const samples: WindowSample[] = [];
  let cumulativeDist = 0;
  let lastCoord: { lat: number; lon: number; timestampMs: number } | null = null;
  let prevElapsed = 0;

  for (let i = 0; i < validRecords.length; i++) {
    const rec = validRecords[i];
    const rawElapsed = (rec.timestampMs - baseTs) / 1000;
    const elapsedSec = Math.max(prevElapsed, rawElapsed);
    prevElapsed = elapsedSec;

    const hasValidGps =
      rec.lat !== null &&
      rec.lon !== null &&
      Number.isFinite(rec.lat) &&
      Number.isFinite(rec.lon);
    let acceptGpsAsAnchor = hasValidGps;

    if (rec.distanceM !== null && Number.isFinite(rec.distanceM)) {
      if (i === 0 && rec.distanceM > 0) {
        cumulativeDist = rec.distanceM;
      } else if (rec.distanceM > cumulativeDist) {
        cumulativeDist = rec.distanceM;
      }
    } else if (lastCoord !== null && hasValidGps) {
      const dtSec = (rec.timestampMs - lastCoord.timestampMs) / 1000;
      const segDist = haversineDistanceMeters(
        lastCoord.lat,
        lastCoord.lon,
        rec.lat as number,
        rec.lon as number
      );
      if (dtSec > 0 && Number.isFinite(segDist) && segDist / dtSec <= FIT_MAX_VALID_SPEED_MS) {
        if (segDist > 0) {
          cumulativeDist += segDist;
        }
      } else {
        // Não avança lastCoord com coordenada de salto GPS anômalo (> 12 m/s) ou dt <= 0
        acceptGpsAsAnchor = false;
      }
    }

    if (acceptGpsAsAnchor && hasValidGps) {
      lastCoord = {
        lat: rec.lat as number,
        lon: rec.lon as number,
        timestampMs: rec.timestampMs,
      };
    }

    samples.push({
      elapsedSec,
      distanceM: cumulativeDist,
      heartRateBpm: normalizeValidHr(rec.heartRateBpm),
    });
  }

  return samples;
}

/**
 * Converte pares de passo pré-filtrados de um arquivo .GPX em uma série monotônica
 * preservando gaps reais entre segmentos no tempo contínuo de parede.
 */
export function samplesFromGpxStepPairs(pairs: GpxStepPair[]): WindowSample[] {
  if (!pairs || pairs.length === 0) return [];

  const baseTs = pairs[0].from.timestampMs;
  const samples: WindowSample[] = [];
  let cumulativeDist = 0;
  let prevElapsed = 0;
  let lastSegIdx = -1;

  for (const pair of pairs) {
    if (pair.segmentIndex !== lastSegIdx) {
      const segStartElapsed = Math.max(
        prevElapsed,
        (pair.from.timestampMs - baseTs) / 1000
      );
      prevElapsed = segStartElapsed;
      samples.push({
        elapsedSec: segStartElapsed,
        distanceM: cumulativeDist,
        heartRateBpm: normalizeValidHr(pair.from.heartRateBpm),
      });
      lastSegIdx = pair.segmentIndex;
    }

    const deltaDist =
      Number.isFinite(pair.deltaDistanceM) && pair.deltaDistanceM > 0
        ? pair.deltaDistanceM
        : 0;
    cumulativeDist += deltaDist;

    const toElapsedFromTs = (pair.to.timestampMs - baseTs) / 1000;
    const toElapsed = Number.isFinite(toElapsedFromTs)
      ? Math.max(prevElapsed, toElapsedFromTs)
      : prevElapsed + Math.max(0, pair.deltaTimeSeconds);
    prevElapsed = toElapsed;

    samples.push({
      elapsedSec: toElapsed,
      distanceM: cumulativeDist,
      heartRateBpm: normalizeValidHr(pair.to.heartRateBpm),
    });
  }

  return samples;
}

/**
 * Interpola linearmente a distância acumulada em um instante `targetSec`.
 */
function interpolateDistanceAt(samples: WindowSample[], targetSec: number): number {
  const n = samples.length;
  if (n === 0) return 0;
  if (targetSec <= samples[0].elapsedSec) return samples[0].distanceM;
  if (targetSec >= samples[n - 1].elapsedSec) return samples[n - 1].distanceM;

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].elapsedSec <= targetSec) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const s0 = samples[lo];
  const s1 = samples[hi];
  const dt = s1.elapsedSec - s0.elapsedSec;
  if (dt <= 0) return s1.distanceM;

  const ratio = Math.min(1, Math.max(0, (targetSec - s0.elapsedSec) / dt));
  return s0.distanceM + ratio * (s1.distanceM - s0.distanceM);
}

/**
 * Calcula FC média ponderada pelo tempo e FC máxima exclusivamente dentro da janela `[winStart, winEnd]`.
 */
function computeWindowHeartRate(
  samples: WindowSample[],
  winStart: number,
  winEnd: number
): { avgHeartRate: number | null; maxHeartRate: number | null } {
  let weightedSum = 0;
  let weightedDuration = 0;
  let maxHr: number | null = null;

  for (const s of samples) {
    if (s.elapsedSec >= winStart && s.elapsedSec <= winEnd && s.heartRateBpm !== null) {
      if (maxHr === null || s.heartRateBpm > maxHr) {
        maxHr = s.heartRateBpm;
      }
    }
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const segStart = Math.max(s0.elapsedSec, winStart);
    const segEnd = Math.min(s1.elapsedSec, winEnd);
    const dt = segEnd - segStart;
    if (dt <= 0) continue;

    const hr = s1.heartRateBpm ?? s0.heartRateBpm;
    if (hr !== null) {
      weightedSum += hr * dt;
      weightedDuration += dt;
      if (maxHr === null || hr > maxHr) {
        maxHr = hr;
      }
    }
  }

  const avgHeartRate =
    weightedDuration > 0 ? Math.round(weightedSum / weightedDuration) : null;
  const clampedMaxHr =
    avgHeartRate !== null && maxHr !== null && maxHr < avgHeartRate
      ? avgHeartRate
      : maxHr;

  return { avgHeartRate, maxHeartRate: clampedMaxHr };
}

/**
 * Fatie uma distância e duração conhecidas em voltas uniformes (usado como fallback de resumo sem records).
 */
function buildUniformLaps(
  totalDistanceMeters: number,
  totalDurationSeconds: number,
  lapDistanceMeters: number
): LapDetail[] {
  if (totalDistanceMeters < MIN_RESIDUAL_SPLIT_METERS || totalDurationSeconds <= 0) {
    return [];
  }

  const laps: LapDetail[] = [];
  let remainingMeters = totalDistanceMeters;
  let lapNumber = 1;
  let elapsedAccumulated = 0;

  while (remainingMeters >= MIN_RESIDUAL_SPLIT_METERS) {
    const isFullLap = remainingMeters >= lapDistanceMeters;
    const lapDist = isFullLap ? lapDistanceMeters : Math.round(remainingMeters);
    const exactLapSec = (lapDist / totalDistanceMeters) * totalDurationSeconds;
    const nextElapsedRounded = Math.round(elapsedAccumulated + exactLapSec);
    const prevElapsedRounded = Math.round(elapsedAccumulated);
    const lapDurationSeconds = Math.max(1, nextElapsedRounded - prevElapsedRounded);
    const paceSeconds = Math.max(1, Math.round((exactLapSec * 1000) / lapDist));

    laps.push({
      lapNumber,
      distanceMeters: lapDist,
      durationSeconds: lapDurationSeconds,
      paceFormatted: formatPaceSeconds(paceSeconds),
    });

    elapsedAccumulated += exactLapSec;
    remainingMeters -= lapDist;
    lapNumber++;

    if (!isFullLap) break;
  }

  return laps;
}

/**
 * Fatie a janela `[winStart, winEnd]` em voltas de `lapDistanceMeters` (padrão 400m) com interpolação temporal.
 */
function extractWindowLaps(
  samples: WindowSample[],
  winStart: number,
  winEnd: number,
  lapDistanceMeters: number
): LapDetail[] {
  const startDist = interpolateDistanceAt(samples, winStart);
  const endDist = interpolateDistanceAt(samples, winEnd);
  const totalWindowDist = endDist - startDist;

  if (totalWindowDist < MIN_RESIDUAL_SPLIT_METERS || winEnd <= winStart) {
    return [];
  }

  // Constrói série normalizada restrita à janela [winStart, winEnd] com distância relativa a partir de 0
  const winPoints: Array<{ relSec: number; relDist: number }> = [
    { relSec: 0, relDist: 0 },
  ];

  for (const s of samples) {
    if (s.elapsedSec > winStart && s.elapsedSec < winEnd) {
      winPoints.push({
        relSec: s.elapsedSec - winStart,
        relDist: Math.max(0, s.distanceM - startDist),
      });
    }
  }

  winPoints.push({
    relSec: winEnd - winStart,
    relDist: totalWindowDist,
  });

  const laps: LapDetail[] = [];
  let lapNumber = 1;
  let lapStartSec = 0;
  let lapStartDist = 0;
  let nextTargetDist = lapDistanceMeters;

  for (let i = 0; i < winPoints.length - 1; i++) {
    const p0 = winPoints[i];
    const p1 = winPoints[i + 1];

    while (p1.relDist >= nextTargetDist - 1e-6 && nextTargetDist <= totalWindowDist + 1e-6) {
      const segDist = p1.relDist - p0.relDist;
      const ratio = segDist > 0 ? Math.min(1, Math.max(0, (nextTargetDist - p0.relDist) / segDist)) : 0;
      const crossingSec = p0.relSec + ratio * (p1.relSec - p0.relSec);

      const rawDuration = Math.max(0.001, crossingSec - lapStartSec);
      const roundedStart = Math.round(lapStartSec);
      const roundedEnd = Math.round(crossingSec);
      const durationSeconds = Math.max(1, roundedEnd - roundedStart);
      const lapDistInt = Math.round(lapDistanceMeters);
      const paceSeconds = Math.max(1, Math.round((rawDuration * 1000) / lapDistInt));

      laps.push({
        lapNumber,
        distanceMeters: lapDistInt,
        durationSeconds,
        paceFormatted: formatPaceSeconds(paceSeconds),
      });

      lapNumber++;
      lapStartSec = crossingSec;
      lapStartDist = nextTargetDist;
      nextTargetDist += lapDistanceMeters;
    }
  }

  // Volta residual final (>= 10 metros)
  const residualDist = totalWindowDist - lapStartDist;
  const residualDuration = winEnd - winStart - lapStartSec;
  if (residualDist >= MIN_RESIDUAL_SPLIT_METERS && residualDuration > 0.5) {
    const residualDistInt = Math.round(residualDist);
    const roundedStart = Math.round(lapStartSec);
    const roundedEnd = Math.round(winEnd - winStart);
    const durationSeconds = Math.max(1, roundedEnd - roundedStart);
    const paceSeconds = Math.max(1, Math.round((residualDuration * 1000) / residualDistInt));

    laps.push({
      lapNumber,
      distanceMeters: residualDistInt,
      durationSeconds,
      paceFormatted: formatPaceSeconds(paceSeconds),
    });
  }

  return laps;
}

/**
 * Normaliza métricas finais de velocidade, pace e duração para `TafWindowSummary`.
 */
function buildWindowSummary(params: {
  targetDurationSeconds: number;
  rawDurationSeconds: number;
  rawDistanceMeters: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  winStartOffset: number;
  winEndOffset: number;
  isShorterThanTarget: boolean;
  laps: LapDetail[];
}): TafWindowSummary | null {
  const distanceMeters = Math.round(params.rawDistanceMeters);
  const actualDurationSeconds = Math.max(1, Math.round(params.rawDurationSeconds));
  if (distanceMeters <= 0 || actualDurationSeconds <= 0) return null;

  const speedKmh = Number(
    (distanceMeters / 1000 / (actualDurationSeconds / 3600)).toFixed(2)
  );
  const paceSeconds = Math.max(
    1,
    Math.round((actualDurationSeconds * 1000) / distanceMeters)
  );

  return {
    targetDurationSeconds: params.targetDurationSeconds,
    actualDurationSeconds,
    distanceMeters,
    speedKmh,
    paceSeconds,
    paceFormatted: formatPaceSeconds(paceSeconds),
    avgHeartRate: params.avgHeartRate,
    maxHeartRate: params.maxHeartRate,
    windowStartOffsetSeconds: Number(params.winStartOffset.toFixed(1)),
    windowEndOffsetSeconds: Number(params.winEndOffset.toFixed(1)),
    isShorterThanTarget: params.isShorterThanTarget,
    laps: params.laps,
  };
}

/**
 * Encontra a melhor janela contínua de `targetDurationSeconds` (padrão 720s / 12 min)
 * dentro de uma série de amostras `(elapsedSec, distanceM, heartRateBpm)`.
 * Se o treino for menor ou igual à janela alvo, retorna toda a duração disponível com
 * `isShorterThanTarget` sinalizado.
 */
export function extractBestTafWindow(
  samples: WindowSample[],
  options: ExtractTafWindowOptions = {}
): TafWindowSummary | null {
  const targetDurationSeconds =
    options.targetDurationSeconds ?? DEFAULT_TAF_WINDOW_SECONDS;
  const lapDistanceMeters = options.lapDistanceMeters ?? DEFAULT_TAF_LAP_METERS;

  const totalSpan =
    samples.length >= 2
      ? samples[samples.length - 1].elapsedSec - samples[0].elapsedSec
      : 0;
  const totalDist =
    samples.length >= 2
      ? samples[samples.length - 1].distanceM - samples[0].distanceM
      : 0;

  if (samples.length < 2 || totalSpan <= 0 || totalDist <= 0) {
    const fb = options.fallbackSummary;
    if (!fb || fb.durationSeconds <= 0 || fb.distanceMeters <= 0) {
      return null;
    }

    const usedDuration = Math.min(fb.durationSeconds, targetDurationSeconds);
    const usedDistance =
      fb.durationSeconds > targetDurationSeconds
        ? fb.distanceMeters * (targetDurationSeconds / fb.durationSeconds)
        : fb.distanceMeters;
    const isShorter = fb.durationSeconds < targetDurationSeconds - SHORT_WINDOW_TOLERANCE_SECONDS;

    const avgHr = normalizeValidHr(fb.avgHeartRate);
    const maxHrRaw = normalizeValidHr(fb.maxHeartRate);
    const maxHr = avgHr !== null && maxHrRaw !== null && maxHrRaw < avgHr ? avgHr : maxHrRaw;

    return buildWindowSummary({
      targetDurationSeconds,
      rawDurationSeconds: usedDuration,
      rawDistanceMeters: usedDistance,
      avgHeartRate: avgHr,
      maxHeartRate: maxHr,
      winStartOffset: 0,
      winEndOffset: usedDuration,
      isShorterThanTarget: isShorter,
      laps: buildUniformLaps(usedDistance, usedDuration, lapDistanceMeters),
    });
  }

  const firstElapsed = samples[0].elapsedSec;
  const lastElapsed = samples[samples.length - 1].elapsedSec;

  if (totalSpan <= targetDurationSeconds) {
    const winStart = firstElapsed;
    const winEnd = lastElapsed;
    const { avgHeartRate, maxHeartRate } = computeWindowHeartRate(
      samples,
      winStart,
      winEnd
    );
    const laps = extractWindowLaps(samples, winStart, winEnd, lapDistanceMeters);

    return buildWindowSummary({
      targetDurationSeconds,
      rawDurationSeconds: totalSpan,
      rawDistanceMeters: totalDist,
      avgHeartRate,
      maxHeartRate,
      winStartOffset: winStart - firstElapsed,
      winEndOffset: winEnd - firstElapsed,
      isShorterThanTarget:
        totalSpan < targetDurationSeconds - SHORT_WINDOW_TOLERANCE_SECONDS,
      laps,
    });
  }

  // Como D(t) é linear por partes entre amostras, o máximo de D(t + W) - D(t)
  // ocorre necessariamente em um ponto onde t = s[i].elapsedSec ou t + W = s[j].elapsedSec.
  let bestStart = firstElapsed;
  let bestEnd = firstElapsed + targetDurationSeconds;
  let bestDist = -1;

  const evaluateCandidate = (candStart: number, candEnd: number) => {
    const startDist = interpolateDistanceAt(samples, candStart);
    const endDist = interpolateDistanceAt(samples, candEnd);
    const gained = endDist - startDist;
    if (gained > bestDist + 1e-6) {
      bestDist = gained;
      bestStart = candStart;
      bestEnd = candEnd;
    }
  };

  for (const s of samples) {
    const candEnd = s.elapsedSec + targetDurationSeconds;
    if (candEnd <= lastElapsed + 1e-6) {
      evaluateCandidate(s.elapsedSec, Math.min(lastElapsed, candEnd));
    }
    const candStart = s.elapsedSec - targetDurationSeconds;
    if (candStart >= firstElapsed - 1e-6) {
      evaluateCandidate(Math.max(firstElapsed, candStart), s.elapsedSec);
    }
  }

  if (bestDist <= 0) return null;

  const { avgHeartRate, maxHeartRate } = computeWindowHeartRate(
    samples,
    bestStart,
    bestEnd
  );
  const laps = extractWindowLaps(samples, bestStart, bestEnd, lapDistanceMeters);

  return buildWindowSummary({
    targetDurationSeconds,
    rawDurationSeconds: bestEnd - bestStart,
    rawDistanceMeters: bestDist,
    avgHeartRate,
    maxHeartRate,
    winStartOffset: bestStart - firstElapsed,
    winEndOffset: bestEnd - firstElapsed,
    isShorterThanTarget: false,
    laps,
  });
}
