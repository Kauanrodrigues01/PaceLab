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
import { shouldSkipSheetsSync, syncRecordWithSheets } from "@/lib/api/sheetsSync";
import { syncTafAttemptToSheet } from "@/lib/googleSheets";
import { resolvePaceMetricsFallback } from "@/lib/math/pace";
import { CreateTafAttemptSchema, PaginationQuerySchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { limit, cursor } = parseQueryParams(request, PaginationQuerySchema);

    const items = await prisma.tafAttempt.findMany({
      ...getCursorPaginationPrismaArgs(limit, cursor),
      orderBy: { testDate: "desc" },
    });

    return buildCursorPaginatedResponse(items, limit);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const skipSheetsSync = shouldSkipSheetsSync(request);
    const { body, data: validated } = await parseJsonBody(
      request,
      CreateTafAttemptSchema
    );

    const distanceKm = validated.distanceMeters / 1000;
    const { speedKmh, paceSeconds, paceFormatted } = resolvePaceMetricsFallback(
      validated,
      distanceKm,
      validated.actualDurationSeconds
    );

    const attemptData = {
      userId: validated.userId || null,
      source: validated.source ?? "manual",
      externalId: validated.externalId ?? null,
      syncedToSheetsAt: validated.syncedToSheetsAt
        ? new Date(validated.syncedToSheetsAt)
        : null,
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

    if (validated.externalId) {
      const existing = await prisma.tafAttempt.findUnique({
        where: { externalId: validated.externalId },
      });

      if (existing) {
        if (validated.onDuplicate !== "update") {
          return buildDuplicateExternalIdResponse(
            attemptData.source,
            validated.externalId,
            existing.id
          );
        }

        const updatePayload = mergeDefinedFields(
          body,
          attemptData,
          existing as Record<string, unknown>,
          [
            "userId",
            "syncedToSheetsAt",
            "testDate",
            "targetDurationSeconds",
            "locationType",
            "shoeName",
            "avgHeartRate",
            "maxHeartRate",
            "notes",
            "laps",
          ],
          { laps: [] }
        );

        const updated = await prisma.tafAttempt.update({
          where: { id: existing.id },
          data: updatePayload as typeof attemptData,
        });

        const syncedUpdated = await syncRecordWithSheets(
          updated,
          () => syncTafAttemptToSheet(updated),
          { skip: skipSheetsSync }
        );

        return apiSuccess(syncedUpdated, 200);
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

      const syncedCreated = await syncRecordWithSheets(
        created,
        () => syncTafAttemptToSheet(created),
        { skip: skipSheetsSync }
      );

      return apiSuccess(syncedCreated, 201);
    } catch (err) {
      if (validated.externalId && isPrismaUniqueConstraintError(err)) {
        const raceExisting = await prisma.tafAttempt
          .findUnique({ where: { externalId: validated.externalId } })
          .catch(() => null);
        return buildDuplicateExternalIdResponse(
          attemptData.source,
          validated.externalId,
          raceExisting?.id
        );
      }
      throw err;
    }
  });
}
