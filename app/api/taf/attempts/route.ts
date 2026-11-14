import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess, apiConflict } from "@/lib/api/response";
import { CreateTafAttemptSchema, PaginationQuerySchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const queryParams: Record<string, string> = {};
    const limitParam = searchParams.get("limit")?.trim();
    const cursorParam = searchParams.get("cursor")?.trim();
    if (limitParam) queryParams.limit = limitParam;
    if (cursorParam) queryParams.cursor = cursorParam;

    const { limit, cursor } = PaginationQuerySchema.parse(queryParams);

    const items = await prisma.tafAttempt.findMany({
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { testDate: "desc" },
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
    const validated = CreateTafAttemptSchema.parse(body);

    const distanceKm = validated.distanceMeters / 1000;
    const speedKmh =
      validated.speedKmh ??
      Number((distanceKm / (validated.actualDurationSeconds / 3600)).toFixed(2));
    const paceSeconds =
      validated.paceSeconds ??
      Math.round(validated.actualDurationSeconds / distanceKm);
    const paceFormatted =
      validated.paceFormatted ??
      `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`;

    const attemptData = {
      userId: validated.userId || null,
      source: validated.source ?? "manual",
      externalId: validated.externalId ?? null,
      testDate: new Date(validated.testDate),
      targetDurationSeconds: validated.targetDurationSeconds,
      actualDurationSeconds: validated.actualDurationSeconds,
      distanceMeters: validated.distanceMeters,
      speedKmh,
      paceSeconds,
      paceFormatted,
      locationType: validated.locationType || null,
      shoeName: validated.shoeName ?? null,
      avgHeartRate:
        validated.avgHeartRate !== undefined ? validated.avgHeartRate : null,
      maxHeartRate:
        validated.maxHeartRate !== undefined ? validated.maxHeartRate : null,
      notes: validated.notes || null,
      laps: validated.laps || [],
    };

    const conflictLabel =
      attemptData.source === "fit_upload" ||
      validated.externalId?.startsWith("fit_")
        ? ".FIT"
        : ".GPX";

    if (validated.externalId) {
      const existing = await prisma.tafAttempt.findUnique({
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

        const updated = await prisma.tafAttempt.update({
          where: { id: existing.id },
          data: {
            ...attemptData,
            testDate: hasRawField("testDate")
              ? attemptData.testDate
              : existing.testDate,
            locationType: hasRawField("locationType")
              ? attemptData.locationType
              : existing.locationType,
            notes: hasRawField("notes") ? attemptData.notes : existing.notes,
            shoeName: hasRawField("shoeName")
              ? attemptData.shoeName
              : existing.shoeName,
            laps: hasRawField("laps") ? attemptData.laps : (existing.laps ?? []),
          },
        });

        return apiSuccess(updated, 200);
      }
    }

    try {
      const created = validated.id
        ? await prisma.tafAttempt.upsert({
            where: { id: validated.id },
            create: {
              id: validated.id,
              ...attemptData,
            },
            update: attemptData,
          })
        : await prisma.tafAttempt.create({
            data: attemptData,
          });

      return apiSuccess(created, 201);
    } catch (err) {
      if (
        validated.externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raceExisting = await prisma.tafAttempt
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
