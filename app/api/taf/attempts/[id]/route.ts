import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { shouldSkipSheetsSync, syncRecordWithSheets } from "@/lib/api/sheetsSync";
import {
  deleteTafAttemptFromSheet,
  safeAutoSync,
  syncTafAttemptToSheet,
} from "@/lib/googleSheets";
import { UpdateTafAttemptSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    const skipSheetsSync = shouldSkipSheetsSync(request);
    const body = await request.json();
    const validated = UpdateTafAttemptSchema.parse(body);

    const hasRawField = (key: string) =>
      Boolean(
        body &&
          typeof body === "object" &&
          Object.prototype.hasOwnProperty.call(body, key) &&
          (body as Record<string, unknown>)[key] !== undefined
      );

    const updated = await prisma.tafAttempt.update({
      where: { id },
      data: {
        ...(hasRawField("testDate") && validated.testDate
          ? { testDate: new Date(validated.testDate) }
          : {}),
        syncedToSheetsAt:
          validated.syncedToSheetsAt !== undefined
            ? validated.syncedToSheetsAt
              ? new Date(validated.syncedToSheetsAt)
              : null
            : null,
        ...(hasRawField("targetDurationSeconds") &&
        validated.targetDurationSeconds !== undefined
          ? { targetDurationSeconds: validated.targetDurationSeconds }
          : {}),
        ...(validated.actualDurationSeconds !== undefined
          ? { actualDurationSeconds: validated.actualDurationSeconds }
          : {}),
        ...(validated.distanceMeters !== undefined
          ? { distanceMeters: validated.distanceMeters }
          : {}),
        ...(validated.speedKmh !== undefined ? { speedKmh: validated.speedKmh } : {}),
        ...(validated.paceSeconds !== undefined ? { paceSeconds: validated.paceSeconds } : {}),
        ...(validated.paceFormatted !== undefined
          ? { paceFormatted: validated.paceFormatted }
          : {}),
        ...(validated.locationType !== undefined
          ? { locationType: validated.locationType || null }
          : {}),
        ...(hasRawField("shoeName") && validated.shoeName !== undefined
          ? { shoeName: validated.shoeName }
          : {}),
        ...(validated.avgHeartRate !== undefined
          ? { avgHeartRate: validated.avgHeartRate }
          : {}),
        ...(validated.maxHeartRate !== undefined
          ? { maxHeartRate: validated.maxHeartRate }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes || null } : {}),
        ...(hasRawField("laps") && validated.laps !== undefined
          ? { laps: validated.laps || [] }
          : {}),
      },
    });

    const syncedUpdated = await syncRecordWithSheets(
      updated,
      () => syncTafAttemptToSheet(updated),
      { skip: skipSheetsSync }
    );

    return apiSuccess(syncedUpdated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    await prisma.tafAttempt.delete({
      where: { id },
    });
    await safeAutoSync(() => deleteTafAttemptFromSheet(id));
    return apiSuccess({ success: true, deletedId: id });
  });
}
