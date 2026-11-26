import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/api/response";
import { parseQueryParams } from "@/lib/api/request";
import { safeReconcileWeeklyPlans } from "@/lib/api/sheetsSync";
import { isGoogleSheetsConfigured } from "@/lib/env";
import { pushWeeklyPlanStatusToSheets, safeAutoSync } from "@/lib/googleSheets";
import { WeeklyPlanQuerySchema } from "@/lib/validations/taf";
import {
  calculateRollingFourWeeksAdherence,
  calculateWeeklyAdherenceSummary,
  computeWeeklyReconciliation,
  evaluateLinkedSessionValidity,
  evaluateWeeklyMatchDetailed,
  getDefaultDisplayWeekStartFortaleza,
  getFortalezaWeekBounds,
  isRealizedWeeklyPlanStatus,
  isRestPlanActivity,
  isSundayPostRolloverFortaleza,
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
    const parsedQuery = parseQueryParams(request, WeeklyPlanQuerySchema);

    const now = new Date();
    const todayKey = toFortalezaDateKey(now);
    const currentWeekBounds = getFortalezaWeekBounds(now);
    const isSundayRolloverWindow = isSundayPostRolloverFortaleza(now);

    let allPlanItems = await prisma.weeklyPlanItem.findMany({
      orderBy: [{ plannedDate: "asc" }, { planExternalId: "asc" }],
      include: {
        matchedSession: true,
      },
    });

    const immediateNextWeekStart = shiftFortalezaDays(currentWeekBounds.weekStart, 7);
    const immediateNextWeekEnd = shiftFortalezaDays(immediateNextWeekStart, 6);
    const hasImmediateNextPlannedWeek = allPlanItems.some((item) => {
      const itemDateKey = toFortalezaDateKey(item.plannedDate);
      return Boolean(
        itemDateKey &&
          itemDateKey >= immediateNextWeekStart &&
          itemDateKey <= immediateNextWeekEnd
      );
    });

    const defaultWeekStart = getDefaultDisplayWeekStartFortaleza(
      now,
      hasImmediateNextPlannedWeek
    );
    const targetBounds = parsedQuery.weekStart
      ? getFortalezaWeekBounds(parsedQuery.weekStart)
      : getFortalezaWeekBounds(defaultWeekStart);

    const { weekStart, weekEnd, label: weekLabel } = targetBounds;
    const isCurrentWeek = weekStart === defaultWeekStart;

    const rangeStartKey = shiftFortalezaDays(weekStart, -1);
    const rangeEndKey = shiftFortalezaDays(weekEnd, 2);

    const candidateSessionsQuery = {
      where: {
        sessionDate: {
          gte: new Date(`${rangeStartKey}T00:00:00.000Z`),
          lt: new Date(`${rangeEndKey}T23:59:59.999Z`),
        },
        weeklyPlanItem: {
          is: null,
        },
      },
      orderBy: [{ sessionDate: "asc" as const }],
    };

    let candidateSessions = await prisma.trainingSession.findMany(candidateSessionsQuery);

    // Reconciliação sob demanda: só persiste e faz write-back quando houver mudança real
    // (ex.: plano vencido, órfão pós-DELETE, sessão livre elegível ou status desatualizado).
    if (todayKey && allPlanItems.length > 0) {
      const initialMatchedIds = new Set(
        allPlanItems
          .map((item) => item.matchedSessionId)
          .filter((id): id is string => Boolean(id))
      );
      const occupiedPlanDateKeys = new Set<string>();
      for (const item of allPlanItems) {
        if (isRestPlanActivity(item.activityType)) continue;
        const k = toFortalezaDateKey(item.plannedDate);
        if (k) occupiedPlanDateKeys.add(k);
      }

      const hasOrphanRealizedPlan = allPlanItems.some(
        (item) =>
          !isRestPlanActivity(item.activityType) &&
          !item.matchedSessionId &&
          isRealizedWeeklyPlanStatus(item.status)
      );

      const hasStaleLinkedPlanInWeek = allPlanItems.some((item) => {
        if (isRestPlanActivity(item.activityType) || !item.matchedSession) {
          return false;
        }
        const itemDateKey = toFortalezaDateKey(item.plannedDate);
        if (!itemDateKey || itemDateKey < weekStart || itemDateKey > weekEnd) {
          return false;
        }
        const validity = evaluateLinkedSessionValidity(
          {
            plannedDate: item.plannedDate,
            activityType: item.activityType,
            targetDistanceKm: item.targetDistanceKm,
            targetPaceFormatted: item.targetPaceFormatted,
          },
          {
            sessionDate: item.matchedSession.sessionDate,
            activityType: item.matchedSession.activityType,
            distanceKm: item.matchedSession.distanceKm,
            durationSeconds: item.matchedSession.durationSeconds,
            paceSeconds: item.matchedSession.paceSeconds,
          },
          { occupiedPlanDateKeys }
        );
        return (
          !validity.valid ||
          validity.nextStatus !== normalizeWeeklyPlanStatus(item.status)
        );
      });

      const unlinkedCandidates = candidateSessions.filter(
        (session) => !initialMatchedIds.has(session.id)
      );
      const preview = computeWeeklyReconciliation(
        allPlanItems,
        unlinkedCandidates,
        todayKey
      );

      if (
        hasOrphanRealizedPlan ||
        hasStaleLinkedPlanInWeek ||
        preview.matches.length > 0 ||
        preview.unmatchedUpdates.length > 0
      ) {
        const reconciled = await safeReconcileWeeklyPlans();
        if (reconciled && reconciled.updatedCount > 0) {
          if (isGoogleSheetsConfigured()) {
            await safeAutoSync(() => pushWeeklyPlanStatusToSheets());
          }
          [allPlanItems, candidateSessions] = await Promise.all([
            prisma.weeklyPlanItem.findMany({
              orderBy: [{ plannedDate: "asc" }, { planExternalId: "asc" }],
              include: {
                matchedSession: true,
              },
            }),
            prisma.trainingSession.findMany(candidateSessionsQuery),
          ]);
        }
      }
    }

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

    const items: WeeklyPlanItemDto[] = weekItemsRaw.map((item) => {
      const normalizedStatus = normalizeWeeklyPlanStatus(item.status);
      const serializedSession = item.matchedSession
        ? serializeTrainingSession(item.matchedSession)
        : null;

      let adaptationReasons: string[] = [];
      if (normalizedStatus === "Adaptado" && serializedSession) {
        adaptationReasons = evaluateWeeklyMatchDetailed(
          {
            activityType: item.activityType,
            targetDistanceKm: item.targetDistanceKm ?? null,
            targetPaceFormatted: item.targetPaceFormatted ?? null,
          },
          {
            activityType: serializedSession.activityType,
            distanceKm: serializedSession.distanceKm,
            durationSeconds: serializedSession.durationSeconds,
            paceSeconds: serializedSession.paceSeconds,
          }
        ).reasons;
      }

      return {
        id: item.id,
        planExternalId: item.planExternalId,
        plannedDate: toFortalezaDateKey(item.plannedDate) || toIsoString(item.plannedDate),
        dayOfWeek: item.dayOfWeek,
        activityType: item.activityType,
        isRestDay: isRestPlanActivity(item.activityType),
        targetDistanceKm: item.targetDistanceKm ?? null,
        targetPaceFormatted: item.targetPaceFormatted ?? null,
        description: item.description ?? null,
        status: normalizedStatus,
        adaptationReason:
          adaptationReasons.length > 0 ? adaptationReasons.join(" · ") : null,
        adaptationReasons,
        matchedSessionId: item.matchedSessionId ?? null,
        matchedSession: serializedSession,
      };
    });

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
      isSundayRolloverWindow,
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
