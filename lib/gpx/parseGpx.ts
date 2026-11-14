import { calculateElevationGain } from "./elevation";
import { computeGpxExternalId } from "./externalId";
import { buildSegmentStepPairs } from "./geo";
import { computeGpxMetrics } from "./metrics";
import { splitByDistance } from "./splits";
import {
  extractBestTafWindow,
  samplesFromGpxStepPairs,
} from "../activityParser/window";
import {
  GpxDebugStats,
  GpxTrackPoint,
  GpxWarning,
  MOVING_SPEED_THRESHOLD_RUN_MS,
  MOVING_SPEED_THRESHOLD_WALK_MS,
  ParsedGpx,
  ParseGpxOptions,
} from "./types";
import { parseGpxXml } from "./xml";

/**
 * Orquestrador puro do parser de arquivos .GPX (Strava / Garmin GPX 1.1).
 * Extrai metadados, métricas de movimento, sensores, ganho de elevação, splits por km e hash anti-duplicação.
 * Não lê nem expõe nenhum dado calórico do XML (D8).
 */
export function parseGpx(
  rawXml: string,
  options?: ParseGpxOptions
): ParsedGpx {
  const xmlRes = parseGpxXml(rawXml, {
    maxTrackPoints: options?.maxTrackPoints,
  });

  const defaultMovingThreshold =
    xmlRes.sourceActivityKind === "walk"
      ? MOVING_SPEED_THRESHOLD_WALK_MS
      : MOVING_SPEED_THRESHOLD_RUN_MS;

  const movingSpeedThresholdMs =
    options?.movingSpeedThresholdMs ?? defaultMovingThreshold;

  const stepRes = buildSegmentStepPairs(xmlRes.segments, {
    movingSpeedThresholdMs,
    maxSpikeSpeedMs: options?.maxSpikeSpeedMs,
  });

  const metrics = computeGpxMetrics(
    xmlRes.segments,
    stepRes.pairs,
    xmlRes.sourceActivityKind
  );

  // Coleta altitudes apenas dos pontos aceitos após filtragem de spikes/Δt<=0
  const acceptedPoints: GpxTrackPoint[] = [];
  let lastSegIdx = -1;
  for (const pair of stepRes.pairs) {
    if (pair.segmentIndex !== lastSegIdx) {
      acceptedPoints.push(pair.from);
      lastSegIdx = pair.segmentIndex;
    }
    acceptedPoints.push(pair.to);
  }

  const elevationGainM = calculateElevationGain(
    acceptedPoints.map((pt) => pt.elevationM)
  );

  const splits = splitByDistance(stepRes.pairs, 1000);

  const externalId = computeGpxExternalId({
    firstTimestampIso: xmlRes.firstRawTimestampIso,
    lastTimestampIso: xmlRes.lastRawTimestampIso,
    rawPointCount: xmlRes.rawTrackPointCount,
  });

  const warnings: GpxWarning[] = [
    ...xmlRes.warnings,
    ...stepRes.warnings,
    ...metrics.warnings,
  ];

  if (elevationGainM === null) {
    warnings.push({
      code: "NO_ELEVATION_DATA",
      message: "O arquivo .GPX não contém dados de altitude (<ele>).",
    });
  }

  const debug: GpxDebugStats = {
    segmentCount: xmlRes.segments.length,
    rawTrackPointCount: xmlRes.rawTrackPointCount,
    validTrackPointCount: xmlRes.validTrackPointCount,
    skippedMissingTimeCount: xmlRes.skippedMissingTimeCount,
    skippedInvalidCoordCount: xmlRes.skippedInvalidCoordCount,
    totalPairsEvaluated: stepRes.totalPairsEvaluated,
    discardedNonPositiveDeltaCount: stepRes.discardedNonPositiveDeltaCount,
    discardedSpikeCount: stepRes.discardedSpikeCount,
    stationaryPairsCount: stepRes.stationaryPairsCount,
    movingPairsCount: stepRes.movingPairsCount,
  };

  const tafWindow = extractBestTafWindow(samplesFromGpxStepPairs(stepRes.pairs), {
    fallbackSummary: {
      durationSeconds: metrics.durationSeconds,
      distanceMeters: metrics.distanceMeters,
      avgHeartRate: metrics.avgHeartRate,
      maxHeartRate: metrics.maxHeartRate,
    },
  });

  return {
    name: xmlRes.name,
    rawType: xmlRes.rawType,
    sourceActivityKind: xmlRes.sourceActivityKind,
    startedAt: metrics.startedAt,
    distanceKm: metrics.distanceKm,
    durationSeconds: metrics.durationSeconds,
    elapsedSeconds: metrics.elapsedSeconds,
    speedKmh: metrics.speedKmh,
    paceSeconds: metrics.paceSeconds,
    paceFormatted: metrics.paceFormatted,
    avgHeartRate: metrics.avgHeartRate,
    maxHeartRate: metrics.maxHeartRate,
    avgCadence: metrics.avgCadence,
    elevationGainM,
    avgTemperatureC: metrics.avgTemperatureC,
    splits,
    tafWindow,
    externalId,
    pointCount: xmlRes.validTrackPointCount,
    warnings,
    debug,
  };
}

export const gpxParserService = {
  parseGpx,
};
