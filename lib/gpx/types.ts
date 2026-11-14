/**
 * Tipos, constantes e classes de erro do serviço de parsing de arquivos .GPX (Strava / Garmin)
 * Módulo 100% puro (sem dependência de banco de dados, rede ou React).
 */

import type { TafWindowSummary } from "@/types";

export const GPX_HASH_VERSION = "v1" as const;

export const EARTH_RADIUS_METERS = 6_371_000;
export const MAX_TRACKPOINTS_DEFAULT = 200_000;
export const MAX_SPEED_SPIKE_MS = 12.0; // ~43,2 km/h (recorde mundial de 100m ~10,4 m/s)
export const MOVING_SPEED_THRESHOLD_RUN_MS = 0.894; // ~3,22 km/h (limiar oficial Strava para corrida)
export const MOVING_SPEED_THRESHOLD_WALK_MS = 0.32; // ~1,15 km/h (limiar calibrado Strava para caminhada GPS 1Hz)
export const GPS_SLOW_JITTER_MAX_DT_SECONDS = 3.0;
export const GPS_SLOW_JITTER_MAX_SPEED_MS = 1.6; // ~5,76 km/h (faixa onde o zig-zag lateral 1Hz infla distância)
export const GPS_SLOW_JITTER_EMA_ALPHA = 0.62; // filtro zero-phase forward-backward calibrado no Marco M1
export const GPS_SLOW_JITTER_MIN_POINTS = 10;
export const MIN_AVG_MOVING_SPEED_KMH = 2.0;
export const MAX_AVG_MOVING_SPEED_KMH = 25.0;
export const MIN_VALID_HEART_RATE = 30;
export const MAX_VALID_HEART_RATE = 250;
export const CADENCE_SINGLE_FOOT_MAX = 130;
export const ELEVATION_SMOOTHING_WINDOW = 5;
export const ELEVATION_HYSTERESIS_METERS = 2.0; // histerese calibrada com o DEM do Strava (Marco M1)
export const MIN_RESIDUAL_SPLIT_METERS = 10;

/**
 * Tabela centralizada de aliases de `<trk><type>` (texto normalizado e códigos numéricos do Strava/Garmin).
 * Mantida em um único local para fácil ajuste após o Marco M1.
 */
export const RUN_TYPE_ALIASES = new Set<string>([
  "run",
  "running",
  "trailrun",
  "trailrunning",
  "virtualrun",
  "virtualrunning",
  "treadmill",
  "trackrun",
  "streetrun",
  "corrida",
  "corridadetrilha",
  "corridaesteira",
  "corridaderua",
  "9", // Strava GPX numeric code for Run
  "53", // VirtualRun numeric code
]);

export const WALK_TYPE_ALIASES = new Set<string>([
  "walk",
  "walking",
  "hike",
  "hiking",
  "virtualwalk",
  "caminhada",
  "trilha",
  "trekking",
  "10", // Strava GPX numeric code for Walk
  "4", // Strava GPX numeric code for Hike
]);

export const OTHER_SPORT_TYPE_ALIASES = new Set<string>([
  "ride",
  "cycling",
  "biking",
  "bicycle",
  "virtualride",
  "ebikeride",
  "mountainbikeride",
  "gravelride",
  "ciclismo",
  "pedal",
  "pedalada",
  "swim",
  "swimming",
  "openwaterswim",
  "natacao",
  "alpineski",
  "backcountryski",
  "nordicski",
  "snowboard",
  "rowing",
  "kayaking",
  "canoeing",
  "standuppaddling",
  "surfing",
  "windsurf",
  "kitesurf",
  "workout",
  "weighttraining",
  "crossfit",
  "yoga",
  "pilates",
  "elliptical",
  "stairstepper",
  "iceskate",
  "inlineskate",
  "skateboard",
  "golf",
  "soccer",
  "tennis",
  "1", // Strava numeric Ride
  "2", // AlpineSki
  "3", // BackcountrySki
  "5", // IceSkate
  "6", // InlineSkate
  "7", // NordicSki
  "8", // RollerSki
  "11", // Workout
  "12", // Snowboard
  "13", // Snowshoe
  "14", // Kitesurf
  "15", // Windsurf
  "16", // Swim
  "17", // VirtualRide
  "18", // EBikeRide
]);

export type GpxActivityClassification = "run" | "walk" | "unknown" | "other";

export type GpxSourceActivityKind = "run" | "walk" | "unknown";

export type GpxParseErrorCode =
  | "INVALID_XML"
  | "NO_TRACKPOINTS"
  | "NO_TIMESTAMPS"
  | "TOO_MANY_POINTS"
  | "UNSUPPORTED_ACTIVITY"
  | "ZERO_DISTANCE"
  | "ZERO_MOVING_TIME";

export class GpxParseError extends Error {
  readonly code: GpxParseErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GpxParseErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GpxParseError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, GpxParseError.prototype);
  }
}

export function isGpxParseError(err: unknown): err is GpxParseError {
  if (err instanceof GpxParseError) return true;
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "GpxParseError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}

export type GpxWarningCode =
  | "MISSING_TIMESTAMPS_SKIPPED"
  | "OUT_OF_RANGE_COORDS_SKIPPED"
  | "NON_POSITIVE_DELTA_TIME_SKIPPED"
  | "GPS_SPIKE_SKIPPED"
  | "MULTIPLE_SEGMENTS_DETECTED"
  | "NO_ELEVATION_DATA"
  | "NO_HEART_RATE_DATA"
  | "NO_CADENCE_DATA"
  | "UNKNOWN_ACTIVITY_TYPE"
  | "CADENCE_DOUBLED";

export interface GpxWarning {
  code: GpxWarningCode;
  message: string;
  count?: number;
}

export interface GpxTrackPoint {
  lat: number;
  lon: number;
  timestampMs: number;
  timestampIso: string;
  elevationM: number | null;
  heartRateBpm: number | null;
  cadenceRaw: number | null;
  temperatureC: number | null;
  powerW: number | null;
}

export interface GpxSegment {
  points: GpxTrackPoint[];
}

export interface GpxStepPair {
  segmentIndex: number;
  from: GpxTrackPoint;
  to: GpxTrackPoint;
  deltaDistanceM: number;
  deltaTimeSeconds: number;
  speedMs: number;
  isMoving: boolean;
  movingTimeSeconds: number;
}

export interface GpxSplit {
  kilometer: number;
  distanceKm: number;
  durationSeconds: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate?: number | null;
  elevationDiffM?: number | null;
}

export interface GpxDebugStats {
  segmentCount: number;
  rawTrackPointCount: number;
  validTrackPointCount: number;
  skippedMissingTimeCount: number;
  skippedInvalidCoordCount: number;
  totalPairsEvaluated: number;
  discardedNonPositiveDeltaCount: number;
  discardedSpikeCount: number;
  stationaryPairsCount: number;
  movingPairsCount: number;
}

export interface ParseGpxOptions {
  maxTrackPoints?: number;
  movingSpeedThresholdMs?: number;
  maxSpikeSpeedMs?: number;
}

export interface ParsedGpx {
  name: string | null;
  rawType: string | null;
  sourceActivityKind: GpxSourceActivityKind;
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
  avgTemperatureC: number | null;
  splits: GpxSplit[];
  tafWindow?: TafWindowSummary | null;
  externalId: string;
  pointCount: number;
  warnings: GpxWarning[];
  debug: GpxDebugStats;
}
