import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess, apiConflict } from "@/lib/api/response";
import {
  CreateTrainingSessionSchema,
  PaginationQuerySchema,
} from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const queryParams: Record<string, string> = {};
    const limitParam = searchParams.get("limit")?.trim();
    const cursorParam = searchParams.get("cursor")?.trim();
    const activityParam = searchParams.get("activityType")?.trim();
    if (limitParam) queryParams.limit = limitParam;
    if (cursorParam) queryParams.cursor = cursorParam;
    if (activityParam) queryParams.activityType = activityParam;

    const { limit, cursor, activityType } = PaginationQuerySchema.parse(queryParams);

    const items = await prisma.trainingSession.findMany({
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: activityType ? { activityType } : undefined,
      orderBy: { sessionDate: "desc" },
    });

    const hasMore = items.length > limit;
    const paginatedItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && paginatedItems.length > 0
        ? paginatedItems[paginatedItems.length - 1].id
        : null;

    return apiSuccess(paginatedItems, 200, {
      limit,
      nextCursor,
      hasMore,
    });
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const validated = CreateTrainingSessionSchema.parse(body);

    const speedKmh =
      validated.speedKmh ??
      Number((validated.distanceKm / (validated.durationSeconds / 3600)).toFixed(2));
    const paceSeconds =
      validated.paceSeconds ??
      Math.round(validated.durationSeconds / validated.distanceKm);
    const paceFormatted =
      validated.paceFormatted ??
      `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`;

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
      metValue:
        validated.metValue !== undefined ? validated.metValue : null,
      calorieMethod: validated.calorieMethod || null,
      calorieSource: validated.calorieSource || null,
      calorieMetadata: validated.calorieMetadata || null,
    };

    const conflictLabel =
      trainingData.source === "fit_upload" ||
      validated.externalId?.startsWith("fit_")
        ? ".FIT"
        : ".GPX";

    if (validated.externalId) {
      const existing = await prisma.trainingSession.findUnique({
        where: { externalId: validated.externalId },
      });

      if (existing) {
        if (validated.onDuplicate !== "update") {
          return apiConflict(`Este arquivo ${conflictLabel} já foi importado`, {
            existingId: existing.id,
          });
        }

        const hasRawField = (key: string) =>
          Boolean(
            body &&
              typeof body === "object" &&
              Object.prototype.hasOwnProperty.call(body, key) &&
              (body as Record<string, unknown>)[key] !== undefined
          );

        const updated = await prisma.trainingSession.update({
          where: { id: existing.id },
          data: {
            ...trainingData,
            sessionDate: hasRawField("sessionDate")
              ? trainingData.sessionDate
              : existing.sessionDate,
            activityType: hasRawField("activityType")
              ? validated.activityType
              : existing.activityType,
            perceivedEffort: hasRawField("perceivedEffort")
              ? trainingData.perceivedEffort
              : existing.perceivedEffort,
            bodyWeightKg: hasRawField("bodyWeightKg")
              ? trainingData.bodyWeightKg
              : existing.bodyWeightKg,
            notes: hasRawField("notes") ? trainingData.notes : existing.notes,
            shoeName: hasRawField("shoeName")
              ? trainingData.shoeName
              : existing.shoeName,
            splits: hasRawField("splits")
              ? trainingData.splits
              : (existing.splits ?? []),
            activeCalories: hasRawField("activeCalories")
              ? trainingData.activeCalories
              : existing.activeCalories,
            totalCalories: hasRawField("totalCalories")
              ? trainingData.totalCalories
              : existing.totalCalories,
            metValue: hasRawField("metValue")
              ? trainingData.metValue
              : existing.metValue,
            calorieMethod: hasRawField("calorieMethod")
              ? trainingData.calorieMethod
              : existing.calorieMethod,
            calorieSource: hasRawField("calorieSource")
              ? trainingData.calorieSource
              : existing.calorieSource,
            calorieMetadata: hasRawField("calorieMetadata")
              ? trainingData.calorieMetadata
              : existing.calorieMetadata,
          },
        });

        return apiSuccess(updated, 200);
      }
    }

    try {
      const created = validated.id
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

      return apiSuccess(created, 201);
    } catch (err) {
      if (
        validated.externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raceExisting = await prisma.trainingSession
          .findUnique({ where: { externalId: validated.externalId } })
          .catch(() => null);
        return apiConflict(`Este arquivo ${conflictLabel} já foi importado`, {
          ...(raceExisting?.id ? { existingId: raceExisting.id } : {}),
          code: "DUPLICATE_EXTERNAL_ID",
        });
      }
      throw err;
    }
  });
}
