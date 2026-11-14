/**
 * Tipos, constantes e classes de erro do serviço de parsing de arquivos binários .FIT (Garmin / Strava Original)
 * Módulo 100% puro (sem dependência de banco de dados, rede ou React).
 */

import type {
  GpxSourceActivityKind,
  GpxSplit,
} from "../gpx/types";
import type { LapDetail, TafWindowSummary } from "@/types";

export const FIT_MAGIC_SIGNATURE = ".FIT";
export const SEMICIRCLES_TO_DEGREES = 180 / Math.pow(2, 31);

export type FitParseErrorCode =
  | "INVALID_FIT"
  | "NO_SESSION_DATA"
  | "UNSUPPORTED_ACTIVITY"
  | "ZERO_DISTANCE"
  | "ZERO_MOVING_TIME";

export class FitParseError extends Error {
  readonly code: FitParseErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: FitParseErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FitParseError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, FitParseError.prototype);
  }
}

export function isFitParseError(err: unknown): err is FitParseError {
  if (err instanceof FitParseError) return true;
  if (!err || typeof err !== "object") return false;
  const candidate = err as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    candidate.name === "FitParseError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}

export type FitWarningCode =
  | "NO_ELEVATION_DATA"
  | "NO_HEART_RATE_DATA"
  | "NO_CADENCE_DATA"
  | "UNKNOWN_ACTIVITY_TYPE"
  | "CADENCE_DOUBLED"
  | "INDOOR_ACTIVITY_NO_GPS"
  | "SPLITS_FROM_RECORDS"
  | "SPLITS_SYNTHESIZED_FROM_SESSION"
  | "MISMATCHED_ACTIVITY_FILES"
  | "ELEVATION_MERGED_FROM_GPX"
  | "NAME_MERGED_FROM_GPX";

export interface FitWarning {
  code: FitWarningCode | string;
  message: string;
  count?: number;
}

export interface FitRecordPoint {
  timestampMs: number;
  timestampIso: string;
  distanceM: number | null;
  lat: number | null;
  lon: number | null;
  elevationM: number | null;
  heartRateBpm: number | null;
  cadenceRaw: number | null;
  temperatureC: number | null;
}

export interface ParsedFit {
  source: "fit_upload";
  name: string | null;
  rawType: string | null;
  sport: string | null;
  subSport: string | null;
  sourceActivityKind: GpxSourceActivityKind;
  isIndoor: boolean;
  startedAt: string;
  distanceKm: number;
  durationSeconds: number;
  elapsedSeconds: number;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  elevationGainM: number | null;
  activeCalories: number | null;
  avgTemperatureC: number | null;
  splits: GpxSplit[];
  laps: LapDetail[];
  tafWindow?: TafWindowSummary | null;
  externalId: string;
  pointCount: number;
  lapCount: number;
  warnings: FitWarning[];
}
