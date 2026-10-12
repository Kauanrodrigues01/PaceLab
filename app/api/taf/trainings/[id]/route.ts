import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { UpdateTrainingSessionSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    const body = await request.json();
    const validated = UpdateTrainingSessionSchema.parse(body);

    const updated = await prisma.trainingSession.update({
      where: { id },
      data: {
        ...(validated.sessionDate ? { sessionDate: new Date(validated.sessionDate) } : {}),
        ...(validated.activityType ? { activityType: validated.activityType } : {}),
        ...(validated.distanceKm !== undefined ? { distanceKm: validated.distanceKm } : {}),
        ...(validated.durationSeconds !== undefined
          ? { durationSeconds: validated.durationSeconds }
          : {}),
        ...(validated.speedKmh !== undefined ? { speedKmh: validated.speedKmh } : {}),
        ...(validated.paceSeconds !== undefined ? { paceSeconds: validated.paceSeconds } : {}),
        ...(validated.paceFormatted !== undefined
          ? { paceFormatted: validated.paceFormatted }
          : {}),
        ...(validated.perceivedEffort !== undefined
          ? { perceivedEffort: validated.perceivedEffort }
          : {}),
        ...(validated.bodyWeightKg !== undefined
          ? { bodyWeightKg: validated.bodyWeightKg }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes || null } : {}),
        ...(validated.splits !== undefined ? { splits: validated.splits || [] } : {}),
      },
    });

    return apiSuccess(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;
    await prisma.trainingSession.delete({
      where: { id },
    });
    return apiSuccess({ success: true, deletedId: id });
  });
}
