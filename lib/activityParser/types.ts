/**
 * Tipos e contratos do Orquestrador Unificado de Parsing de Atividades (.FIT Prioritário + .GPX Complementar/Fallback)
 * Módulo 100% puro (sem dependência de banco de dados, rede ou React).
 */

import type { LapDetail, TafWindowSummary } from "@/types";
import type { GpxSourceActivityKind, GpxSplit } from "../gpx/types";

export const MAX_FIT_GPX_START_DIFF_MS = 5 * 60 * 1000; // 5 minutos (300.000 ms)

export type ActivityFileKind = "fit" | "gpx";

export interface RawActivityFileInput {
  fileName?: string;
  buffer: Buffer | Uint8Array | ArrayBuffer | string;
}

export interface ActivityParserInput {
  fitBuffer?: Buffer | Uint8Array | ArrayBuffer | null;
  gpxXml?: string | Buffer | Uint8Array | ArrayBuffer | null;
  files?: RawActivityFileInput[];
}

export interface ActivityParseWarning {
  code: string;
  message: string;
  count?: number;
}

export interface ParsedActivity {
  source: "fit_upload" | "gpx_upload";
  filesUsed: ActivityFileKind[];
  name: string | null;
  rawType: string | null;
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
  warnings: ActivityParseWarning[];
}
