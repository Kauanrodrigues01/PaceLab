import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess, apiError } from "@/lib/api/response";
import {
  safeReconcileWeeklyPlans,
  shouldSkipSheetsSync,
  syncRecordWithSheets,
} from "@/lib/api/sheetsSync";
import {
  deleteTrainingSessionFromSheet,
  pushWeeklyPlanStatusToSheets,
  safeAutoSync,
  syncTrainingSessionToSheet,
} from "@/lib/googleSheets";
import { UpdateTrainingSessionSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const session = await prisma.trainingSession.findUnique({
      where: { id: params.id },
    });

    if (!session) {
      return apiError("Treino não encontrado no banco de dados", 404);
    }

    return apiSuccess(session);
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    const skipSheetsSync = shouldSkipSheetsSync(request);
    const body = await request.json();
    const validated = UpdateTrainingSessionSchema.parse(body);

    const hasRawField = (key: string) =>
      Boolean(
        body &&
          typeof body === "object" &&
          Object.prototype.hasOwnProperty.call(body, key) &&
          (body as Record<string, unknown>)[key] !== undefined
      );

    const updated = await prisma.trainingSession.update({
      where: { id },
      data: {
        ...(hasRawField("sessionDate") && validated.sessionDate
          ? { sessionDate: new Date(validated.sessionDate) }
          : {}),
        ...(hasRawField("activityType") && validated.activityType
          ? { activityType: validated.activityType }
          : {}),
        syncedToSheetsAt:
          validated.syncedToSheetsAt !== undefined
            ? validated.syncedToSheetsAt
              ? new Date(validated.syncedToSheetsAt)
              : null
            : null,
        ...(validated.distanceKm !== undefined ? { distanceKm: validated.distanceKm } : {}),
        ...(validated.durationSeconds !== undefined
          ? { durationSeconds: validated.durationSeconds }
          : {}),
        ...(validated.elapsedSeconds !== undefined
          ? { elapsedSeconds: validated.elapsedSeconds }
          : {}),
        ...(validated.speedKmh !== undefined ? { speedKmh: validated.speedKmh } : {}),
        ...(validated.paceSeconds !== undefined ? { paceSeconds: validated.paceSeconds } : {}),
        ...(validated.paceFormatted !== undefined
          ? { paceFormatted: validated.paceFormatted }
          : {}),
        ...(validated.avgHeartRate !== undefined
          ? { avgHeartRate: validated.avgHeartRate }
          : {}),
        ...(validated.maxHeartRate !== undefined
          ? { maxHeartRate: validated.maxHeartRate }
          : {}),
        ...(validated.elevationGainM !== undefined
          ? { elevationGainM: validated.elevationGainM }
          : {}),
        ...(validated.avgCadence !== undefined
          ? { avgCadence: validated.avgCadence }
          : {}),
        ...(hasRawField("shoeName") && validated.shoeName !== undefined
          ? { shoeName: validated.shoeName }
          : {}),
        ...(validated.perceivedEffort !== undefined
          ? { perceivedEffort: validated.perceivedEffort }
          : {}),
        ...(validated.bodyWeightKg !== undefined
          ? { bodyWeightKg: validated.bodyWeightKg }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes || null } : {}),
        ...(hasRawField("splits") && validated.splits !== undefined
          ? { splits: validated.splits || [] }
          : {}),
        ...(validated.activeCalories !== undefined
          ? { activeCalories: validated.activeCalories }
          : {}),
        ...(validated.totalCalories !== undefined
          ? { totalCalories: validated.totalCalories }
          : {}),
        ...(validated.metValue !== undefined ? { metValue: validated.metValue } : {}),
        ...(validated.calorieMethod !== undefined
          ? { calorieMethod: validated.calorieMethod }
          : {}),
        ...(validated.calorieSource !== undefined
          ? { calorieSource: validated.calorieSource }
          : {}),
        ...(validated.calorieMetadata !== undefined
          ? { calorieMetadata: validated.calorieMetadata }
          : {}),
      },
    });

    await safeReconcileWeeklyPlans({ editedSessionId: id });

    const syncedUpdated = await syncRecordWithSheets(
      updated,
      () => syncTrainingSessionToSheet(updated),
      { skip: skipSheetsSync }
    );

    if (!skipSheetsSync) {
      await safeAutoSync(() => pushWeeklyPlanStatusToSheets());
    }

    return apiSuccess(syncedUpdated);
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    const skipSheetsSync = shouldSkipSheetsSync(request);

    await prisma.trainingSession.delete({
      where: { id },
    });
    await safeReconcileWeeklyPlans();

    if (!skipSheetsSync) {
      await safeAutoSync(() => deleteTrainingSessionFromSheet(id));
      await safeAutoSync(() => pushWeeklyPlanStatusToSheets());
    }

    return apiSuccess({ success: true, deletedId: id });
  });
}
