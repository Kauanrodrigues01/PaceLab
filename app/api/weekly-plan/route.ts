import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { WeeklyPlanQuerySchema } from "@/lib/validations/taf";
import {
  calculateRollingFourWeeksAdherence,
  calculateWeeklyAdherenceSummary,
  getFortalezaWeekBounds,
  isRestPlanActivity,
  normalizeWeeklyPlanStatus,
  shiftFortalezaDays,
  toFortalezaDateKey,
} from "@/lib/math/weeklyAdherence";
import type {
  ActivitySource,
  ActivityType,
  SplitDetail,
  TrainingSession,
  WeeklyPlanData,
  WeeklyPlanItemDto,
} from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawSessionRecord = {
  id: string;
  userId?: string | null;
  source?: string;
  externalId?: string | null;
  syncedToSheetsAt?: Date | string | null;
  sessionDate: Date | string;
  activityType: string;
  distanceKm: number;
  durationSeconds: number;
  elapsedSeconds?: number | null;
  speedKmh: number;
  paceSeconds: number;
  paceFormatted: string;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  elevationGainM?: number | null;
  avgCadence?: number | null;
  shoeName?: string | null;
  perceivedEffort?: number | null;
  bodyWeightKg?: number | null;
  notes?: string | null;
  splits?: Prisma.JsonValue | SplitDetail[] | null;
  activeCalories?: number | null;
  totalCalories?: number | null;
  metValue?: number | null;
  calorieMethod?: string | null;
  calorieSource?: string | null;
  calorieMetadata?: Prisma.JsonValue | Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

function toIsoString(value: Date | string | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNullableIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeSplits(value: unknown): SplitDetail[] {
  return Array.isArray(value) ? (value as SplitDetail[]) : [];
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function serializeTrainingSession(session: RawSessionRecord): TrainingSession {
  const sessionDateIso = toIsoString(session.sessionDate);
  return {
    id: session.id,
    userId: session.userId ?? null,
    source: (session.source as ActivitySource | undefined) ?? undefined,
    externalId: session.externalId ?? null,
    syncedToSheetsAt: toNullableIsoString(session.syncedToSheetsAt),
    sessionDate: sessionDateIso,
    activityType: session.activityType as ActivityType,
    distanceKm: session.distanceKm,
    durationSeconds: session.durationSeconds,
    elapsedSeconds: session.elapsedSeconds ?? null,
    speedKmh: session.speedKmh,
    paceSeconds: session.paceSeconds,
    paceFormatted: session.paceFormatted,
    avgHeartRate: session.avgHeartRate ?? null,
    maxHeartRate: session.maxHeartRate ?? null,
    elevationGainM: session.elevationGainM ?? null,
    avgCadence: session.avgCadence ?? null,
    shoeName: session.shoeName ?? null,
    perceivedEffort: session.perceivedEffort ?? null,
    bodyWeightKg: session.bodyWeightKg ?? null,
    notes: session.notes ?? null,
    splits: normalizeSplits(session.splits),
    activeCalories: session.activeCalories ?? null,
    totalCalories: session.totalCalories ?? null,
    metValue: session.metValue ?? null,
    calorieMethod: session.calorieMethod ?? null,
    calorieSource: session.calorieSource ?? null,
    calorieMetadata: normalizeMetadata(session.calorieMetadata),
    createdAt: toIsoString(session.createdAt, sessionDateIso),
    updatedAt: toIsoString(session.updatedAt, sessionDateIso),
  };
}

export async function GET(request: NextRequest | Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const parsedQuery = WeeklyPlanQuerySchema.parse({
      weekStart: searchParams.get("weekStart")?.trim() || undefined,
    });

    const currentWeekBounds = getFortalezaWeekBounds();
    const targetBounds = parsedQuery.weekStart
      ? getFortalezaWeekBounds(parsedQuery.weekStart)
      : currentWeekBounds;

    const { weekStart, weekEnd, label: weekLabel } = targetBounds;
    const isCurrentWeek = weekStart === currentWeekBounds.weekStart;

    const allPlanItems = await prisma.weeklyPlanItem.findMany({
      orderBy: [{ plannedDate: "asc" }, { planExternalId: "asc" }],
      include: {
        matchedSession: true,
      },
    });

    const weekItemsRaw: typeof allPlanItems = [];
    const matchedSessionIds = new Set<string>();
    let hasNextPlannedWeek = false;

    for (const item of allPlanItems) {
      if (item.matchedSessionId) {
        matchedSessionIds.add(item.matchedSessionId);
      }

      const itemDateKey = toFortalezaDateKey(item.plannedDate);
      if (!itemDateKey) continue;

      if (itemDateKey > weekEnd) {
        hasNextPlannedWeek = true;
      }

      if (itemDateKey >= weekStart && itemDateKey <= weekEnd) {
        weekItemsRaw.push(item);
      }
    }

    const rangeStartKey = shiftFortalezaDays(weekStart, -1);
    const rangeEndKey = shiftFortalezaDays(weekEnd, 2);

    const candidateSessions = await prisma.trainingSession.findMany({
      where: {
        sessionDate: {
          gte: new Date(`${rangeStartKey}T00:00:00.000Z`),
          lt: new Date(`${rangeEndKey}T23:59:59.999Z`),
        },
        weeklyPlanItem: {
          is: null,
        },
      },
      orderBy: [{ sessionDate: "asc" }],
    });

    const extraSessions: TrainingSession[] = [];
    for (const session of candidateSessions) {
      if (matchedSessionIds.has(session.id)) {
        continue;
      }
      const sessionDateKey = toFortalezaDateKey(session.sessionDate);
      if (!sessionDateKey || sessionDateKey < weekStart || sessionDateKey > weekEnd) {
        continue;
      }
      extraSessions.push(serializeTrainingSession(session));
    }

    const items: WeeklyPlanItemDto[] = weekItemsRaw.map((item) => ({
      id: item.id,
      planExternalId: item.planExternalId,
      plannedDate: toFortalezaDateKey(item.plannedDate) || toIsoString(item.plannedDate),
      dayOfWeek: item.dayOfWeek,
      activityType: item.activityType,
      isRestDay: isRestPlanActivity(item.activityType),
      targetDistanceKm: item.targetDistanceKm ?? null,
      targetPaceFormatted: item.targetPaceFormatted ?? null,
      description: item.description ?? null,
      status: normalizeWeeklyPlanStatus(item.status),
      matchedSessionId: item.matchedSessionId ?? null,
      matchedSession: item.matchedSession
        ? serializeTrainingSession(item.matchedSession)
        : null,
    }));

    const summary = calculateWeeklyAdherenceSummary(items);
    const rollingFourWeeksAverage = calculateRollingFourWeeksAdherence(
      allPlanItems,
      weekStart
    );
    const extraSummary = {
      count: extraSessions.length,
      totalDistanceKm: Number(
        extraSessions
          .reduce(
            (sum, session) =>
              sum + (Number.isFinite(session.distanceKm) ? session.distanceKm : 0),
            0
          )
          .toFixed(2)
      ),
    };

    const payload: WeeklyPlanData = {
      weekStart,
      weekEnd,
      weekLabel,
      isCurrentWeek,
      hasNextPlannedWeek,
      items,
      summary,
      rollingFourWeeksAverage,
      extraSessions,
      extraSummary,
    };

    return apiSuccess(payload);
  });
}
