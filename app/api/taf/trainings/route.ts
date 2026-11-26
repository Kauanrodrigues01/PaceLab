import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/api/response";
import {
  mergeDefinedFields,
  parseJsonBody,
  parseQueryParams,
} from "@/lib/api/request";
import {
  buildCursorPaginatedResponse,
  getCursorPaginationPrismaArgs,
} from "@/lib/api/pagination";
import {
  buildDuplicateExternalIdResponse,
  isPrismaUniqueConstraintError,
} from "@/lib/api/externalIdConflict";
import {
  shouldSkipSheetsSync,
  syncTrainingRecordWithPlanAndSheets,
} from "@/lib/api/sheetsSync";
import {
  pushWeeklyPlanStatusToSheets,
  syncTrainingSessionToSheet,
} from "@/lib/googleSheets";
import { resolvePaceMetricsFallback } from "@/lib/math/pace";
import {
  CreateTrainingSessionSchema,
  PaginationQuerySchema,
} from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { limit, cursor, activityType } = parseQueryParams(
      request,
      PaginationQuerySchema
    );

    const items = await prisma.trainingSession.findMany({
      ...getCursorPaginationPrismaArgs(limit, cursor),
      where: activityType ? { activityType } : undefined,
      orderBy: { sessionDate: "desc" },
    });

    return buildCursorPaginatedResponse(items, limit);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const skipSheetsSync = shouldSkipSheetsSync(request);
    const { body, data: validated } = await parseJsonBody(
      request,
      CreateTrainingSessionSchema
    );

    const { speedKmh, paceSeconds, paceFormatted } = resolvePaceMetricsFallback(
      validated,
      validated.distanceKm,
      validated.durationSeconds
    );

    const trainingData = {
      userId: validated.userId || null,
      source: validated.source ?? "manual",
      externalId: validated.externalId ?? null,
      syncedToSheetsAt: validated.syncedToSheetsAt
        ? new Date(validated.syncedToSheetsAt)
        : null,
      sessionDate: new Date(validated.sessionDate),
      activityType: validated.activityType,
      distanceKm: validated.distanceKm,
      durationSeconds: validated.durationSeconds,
      elapsedSeconds:
        validated.elapsedSeconds !== undefined ? validated.elapsedSeconds : null,
      speedKmh,
      paceSeconds,
      paceFormatted,
      avgHeartRate:
        validated.avgHeartRate !== undefined ? validated.avgHeartRate : null,
      maxHeartRate:
        validated.maxHeartRate !== undefined ? validated.maxHeartRate : null,
      elevationGainM:
        validated.elevationGainM !== undefined ? validated.elevationGainM : null,
      avgCadence:
        validated.avgCadence !== undefined ? validated.avgCadence : null,
      shoeName: validated.shoeName ?? null,
      perceivedEffort:
        validated.perceivedEffort !== undefined ? validated.perceivedEffort : null,
      bodyWeightKg:
        validated.bodyWeightKg !== undefined ? validated.bodyWeightKg : null,
      notes: validated.notes || null,
      splits: validated.splits || [],
      activeCalories:
        validated.activeCalories !== undefined ? validated.activeCalories : null,
      totalCalories:
        validated.totalCalories !== undefined ? validated.totalCalories : null,
      metValue: validated.metValue !== undefined ? validated.metValue : null,
      calorieMethod: validated.calorieMethod || null,
      calorieSource: validated.calorieSource || null,
      calorieMetadata: validated.calorieMetadata || null,
    };

    if (validated.externalId) {
      const existing = await prisma.trainingSession.findUnique({
        where: { externalId: validated.externalId },
      });

      if (existing) {
        if (validated.onDuplicate !== "update") {
          return buildDuplicateExternalIdResponse(
            trainingData.source,
            validated.externalId,
            existing.id
          );
        }

        const updatePayload = mergeDefinedFields(
          body,
          trainingData,
          existing as Record<string, unknown>,
          [
            "userId",
            "syncedToSheetsAt",
            "sessionDate",
            "activityType",
            "elapsedSeconds",
            "avgHeartRate",
            "maxHeartRate",
            "elevationGainM",
            "avgCadence",
            "perceivedEffort",
            "bodyWeightKg",
            "notes",
            "shoeName",
            "splits",
            "activeCalories",
            "totalCalories",
            "metValue",
            "calorieMethod",
            "calorieSource",
            "calorieMetadata",
          ],
          { splits: [] }
        );

        const updated = await prisma.trainingSession.update({
          where: { id: existing.id },
          data: updatePayload as typeof trainingData,
        });

        const syncedUpdated = await syncTrainingRecordWithPlanAndSheets(
          updated,
          () => syncTrainingSessionToSheet(updated),
          () => pushWeeklyPlanStatusToSheets(),
          { skipSheetsSync, editedSessionId: updated.id }
        );

        return apiSuccess(syncedUpdated, 200);
      }
    }

    let created: Awaited<ReturnType<typeof prisma.trainingSession.create>>;
    try {
      created = validated.id
        ? await prisma.trainingSession.upsert({
            where: { id: validated.id },
            create: {
              id: validated.id,
              ...trainingData,
            },
            update: trainingData,
          })
        : await prisma.trainingSession.create({
            data: trainingData,
          });
    } catch (err) {
      if (validated.externalId && isPrismaUniqueConstraintError(err)) {
        const raceExisting = await prisma.trainingSession
          .findUnique({ where: { externalId: validated.externalId } })
          .catch(() => null);
        return buildDuplicateExternalIdResponse(
          trainingData.source,
          validated.externalId,
          raceExisting?.id
        );
      }
      throw err;
    }

    const syncedCreated = await syncTrainingRecordWithPlanAndSheets(
      created,
      () => syncTrainingSessionToSheet(created),
      () => pushWeeklyPlanStatusToSheets(),
      {
        skipSheetsSync,
        editedSessionId: validated.id ? created.id : undefined,
      }
    );

    return apiSuccess(syncedCreated, 201);
  });
}
