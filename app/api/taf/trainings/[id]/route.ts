import { prisma } from "@/lib/prisma";
import {
  apiDeleted,
  apiNotFound,
  apiSuccess,
  withApiHandler,
} from "@/lib/api/response";
import {
  parseJsonBody,
  parsePathId,
  resolveDefinedUpdateFields,
} from "@/lib/api/request";
import {
  safeReconcileWeeklyPlans,
  shouldSkipSheetsSync,
  syncTrainingRecordWithPlanAndSheets,
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
    const id = parsePathId(params);
    const session = await prisma.trainingSession.findUnique({
      where: { id },
    });

    if (!session) {
      return apiNotFound("Treino não encontrado no banco de dados");
    }

    return apiSuccess(session);
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const id = parsePathId(params);
    const skipSheetsSync = shouldSkipSheetsSync(request);
    const { body, data: validated } = await parseJsonBody(
      request,
      UpdateTrainingSessionSchema
    );

    const updateData = {
      ...resolveDefinedUpdateFields(body, validated, {
        sessionDate: (val) => new Date(val),
        syncedToSheetsAt: (val) => (val ? new Date(val) : null),
        notes: (val) => val || null,
        splits: (val) => val || [],
      }),
      ...(validated.syncedToSheetsAt === undefined
        ? { syncedToSheetsAt: null }
        : {}),
    };

    const updated = await prisma.trainingSession.update({
      where: { id },
      data: updateData,
    });

    const syncedUpdated = await syncTrainingRecordWithPlanAndSheets(
      updated,
      () => syncTrainingSessionToSheet(updated),
      () => pushWeeklyPlanStatusToSheets(),
      { skipSheetsSync, editedSessionId: id }
    );

    return apiSuccess(syncedUpdated);
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const id = parsePathId(params);
    const skipSheetsSync = shouldSkipSheetsSync(request);

    await prisma.trainingSession.delete({
      where: { id },
    });
    await safeReconcileWeeklyPlans();

    if (!skipSheetsSync) {
      await safeAutoSync(() => deleteTrainingSessionFromSheet(id));
      await safeAutoSync(() => pushWeeklyPlanStatusToSheets());
    }

    return apiDeleted(id);
  });
}
