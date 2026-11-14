import { computeSplitElevationDiff } from "./elevation";
import { formatPaceSeconds } from "./metrics";
import {
  GpxSplit,
  MAX_VALID_HEART_RATE,
  MIN_RESIDUAL_SPLIT_METERS,
  MIN_VALID_HEART_RATE,
} from "./types";

export interface DistanceSplitInput {
  deltaDistanceM: number;
  movingTimeSeconds: number;
  isMoving: boolean;
  from: {
    elevationM: number | null;
    heartRateBpm: number | null;
  };
  to: {
    elevationM: number | null;
    heartRateBpm: number | null;
  };
}

/**
 * Divide os pares de movimento em parciais por distância (`splitDistanceMeters`, padrão 1.000 m),
 * aplicando interpolação linear ao cruzar cada marca e emitindo parcial residual quando >= 10 m.
 */
export function splitByDistance(
  pairs: readonly DistanceSplitInput[],
  splitDistanceMeters = 1000
): GpxSplit[] {
  if (pairs.length === 0 || splitDistanceMeters <= 0) {
    return [];
  }

  const splits: GpxSplit[] = [];
  let splitIndex = 1;
  let accDistM = 0;
  let accMovingTimeSec = 0;
  let accHrWeightedSec = 0;
  let accHrTimeSec = 0;
  let startEle: number | null = null;
  let currentEndEle: number | null = null;

  for (const pair of pairs) {
    const d = pair.deltaDistanceM;
    const tMov = pair.movingTimeSeconds;

    if (!pair.isMoving || d <= 0 || tMov <= 0) {
      continue;
    }

    const rawHr = pair.isMoving
      ? (pair.to.heartRateBpm ?? pair.from.heartRateBpm)
      : null;
    const validHr =
      rawHr !== null &&
      rawHr >= MIN_VALID_HEART_RATE &&
      rawHr <= MAX_VALID_HEART_RATE
        ? rawHr
        : null;

    const eleFrom = pair.from.elevationM;
    const eleTo = pair.to.elevationM;

    let remDist = d;
    let curProgress = 0;

    while (remDist > 1e-9) {
      const needed = splitDistanceMeters - accDistM;
      const takeDist = Math.min(remDist, needed);
      const fractionOfStep = takeDist / d;
      const prevProgress = curProgress;
      const nextProgress = curProgress + fractionOfStep;
      const takeTime = tMov * fractionOfStep;

      let eleStartPiece: number | null = null;
      let eleEndPiece: number | null = null;
      if (eleFrom !== null && eleTo !== null) {
        eleStartPiece = eleFrom + (eleTo - eleFrom) * prevProgress;
        eleEndPiece = eleFrom + (eleTo - eleFrom) * nextProgress;
      } else {
        eleStartPiece = eleFrom ?? eleTo;
        eleEndPiece = eleTo ?? eleFrom;
      }

      if (startEle === null && eleStartPiece !== null) {
        startEle = eleStartPiece;
      }
      if (eleEndPiece !== null) {
        currentEndEle = eleEndPiece;
      }

      accDistM += takeDist;
      accMovingTimeSec += takeTime;

      if (validHr !== null && takeTime > 0) {
        accHrWeightedSec += validHr * takeTime;
        accHrTimeSec += takeTime;
      }

      remDist -= takeDist;
      curProgress = nextProgress;

      if (Math.abs(accDistM - splitDistanceMeters) <= 1e-6) {
        const distKm = Number((splitDistanceMeters / 1000).toFixed(3));
        const durationSeconds = Math.max(1, Math.round(accMovingTimeSec));
        const paceSeconds = Math.max(
          1,
          Math.round(accMovingTimeSec / (splitDistanceMeters / 1000))
        );

        splits.push({
          kilometer: splitIndex,
          distanceKm: distKm,
          durationSeconds,
          paceSeconds,
          paceFormatted: formatPaceSeconds(paceSeconds),
          avgHeartRate:
            accHrTimeSec > 0
              ? Math.round(accHrWeightedSec / accHrTimeSec)
              : null,
          elevationDiffM: computeSplitElevationDiff(startEle, currentEndEle),
        });

        splitIndex++;
        accDistM = 0;
        accMovingTimeSec = 0;
        accHrWeightedSec = 0;
        accHrTimeSec = 0;
        startEle = currentEndEle;
        currentEndEle = null;
      }
    }
  }

  // Parcial residual (apenas se >= MIN_RESIDUAL_SPLIT_METERS = 10 m e com tempo em movimento > 0)
  if (accDistM >= MIN_RESIDUAL_SPLIT_METERS && accMovingTimeSec > 0) {
    const distKm = Number((accDistM / 1000).toFixed(3));
    const durationSeconds = Math.max(1, Math.round(accMovingTimeSec));
    const paceSeconds = Math.max(
      1,
      Math.round(accMovingTimeSec / (accDistM / 1000))
    );

    splits.push({
      kilometer: splitIndex,
      distanceKm: distKm,
      durationSeconds,
      paceSeconds,
      paceFormatted: formatPaceSeconds(paceSeconds),
      avgHeartRate:
        accHrTimeSec > 0 ? Math.round(accHrWeightedSec / accHrTimeSec) : null,
      elevationDiffM: computeSplitElevationDiff(startEle, currentEndEle),
    });
  }

  return splits;
}
