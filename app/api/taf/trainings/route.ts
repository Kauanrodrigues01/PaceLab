import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
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
      sessionDate: new Date(validated.sessionDate),
      activityType: validated.activityType,
      distanceKm: validated.distanceKm,
      durationSeconds: validated.durationSeconds,
      speedKmh,
      paceSeconds,
      paceFormatted,
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
  });
}
