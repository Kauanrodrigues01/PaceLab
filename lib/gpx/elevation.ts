import {
  ELEVATION_HYSTERESIS_METERS,
  ELEVATION_SMOOTHING_WINDOW,
} from "./types";

/**
 * Aplica média móvel centrada (janela padrão de 5 pontos) sobre um array de altitudes.
 */
export function smoothElevations(
  elevations: number[],
  windowSize = ELEVATION_SMOOTHING_WINDOW
): number[] {
  const n = elevations.length;
  if (n <= 1 || windowSize <= 1) {
    return [...elevations];
  }

  const half = Math.floor(windowSize / 2);
  const smoothed = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += elevations[j];
      count++;
    }
    smoothed[i] = sum / count;
  }

  return smoothed;
}

export interface CalculateElevationGainOptions {
  windowSize?: number;
  hysteresisMeters?: number;
}

/**
 * Calcula o ganho de elevação acumulado (D+) a partir das altitudes dos trackpoints,
 * aplicando média móvel centrada de 5 pontos e histerese de 1,0 m (A11).
 * Retorna `null` caso não existam pontos com `<ele>`.
 */
export function calculateElevationGain(
  rawElevations: Array<number | null | undefined>,
  options?: CalculateElevationGainOptions
): number | null {
  const valid: number[] = [];
  for (const val of rawElevations) {
    if (typeof val === "number" && Number.isFinite(val)) {
      valid.push(val);
    }
  }

  if (valid.length === 0) {
    return null;
  }

  if (valid.length < 2) {
    return 0;
  }

  const windowSize = options?.windowSize ?? ELEVATION_SMOOTHING_WINDOW;
  const hysteresis = options?.hysteresisMeters ?? ELEVATION_HYSTERESIS_METERS;

  const smoothed = smoothElevations(valid, windowSize);
  let valley = smoothed[0];
  let peak = smoothed[0];
  let totalGain = 0;
  let inClimb = false;

  for (let i = 1; i < smoothed.length; i++) {
    const ele = smoothed[i];

    if (!inClimb) {
      if (ele < valley) {
        valley = ele;
      } else if (ele - valley >= hysteresis) {
        totalGain += ele - valley;
        peak = ele;
        inClimb = true;
      }
    } else {
      if (ele > peak) {
        totalGain += ele - peak;
        peak = ele;
      } else if (peak - ele >= hysteresis) {
        valley = ele;
        inClimb = false;
      }
    }
  }

  const rounded = Math.round(totalGain);
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
}

/**
 * Calcula a diferença líquida de altitude em uma parcial (`Math.round(eleFim - eleInicio)`).
 */
export function computeSplitElevationDiff(
  startElevationM: number | null | undefined,
  endElevationM: number | null | undefined
): number | null {
  if (
    typeof startElevationM !== "number" ||
    !Number.isFinite(startElevationM) ||
    typeof endElevationM !== "number" ||
    !Number.isFinite(endElevationM)
  ) {
    return null;
  }

  const diff = Math.round(endElevationM - startElevationM);
  return Object.is(diff, -0) ? 0 : diff;
}
