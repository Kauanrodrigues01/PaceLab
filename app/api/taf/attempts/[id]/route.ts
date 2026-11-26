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
import { shouldSkipSheetsSync, syncRecordWithSheets } from "@/lib/api/sheetsSync";
import {
  deleteTafAttemptFromSheet,
  safeAutoSync,
  syncTafAttemptToSheet,
} from "@/lib/googleSheets";
import { UpdateTafAttemptSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const id = parsePathId(params);
    const attempt = await prisma.tafAttempt.findUnique({
      where: { id },
    });

    if (!attempt) {
      return apiNotFound("Simulado não encontrado no banco de dados");
    }

    return apiSuccess(attempt);
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
      UpdateTafAttemptSchema
    );

    const updateData = {
      ...resolveDefinedUpdateFields(body, validated, {
        testDate: (val) => new Date(val),
        syncedToSheetsAt: (val) => (val ? new Date(val) : null),
        locationType: (val) => val || null,
        notes: (val) => val || null,
        laps: (val) => val || [],
      }),
      ...(validated.syncedToSheetsAt === undefined
        ? { syncedToSheetsAt: null }
        : {}),
    };

    const updated = await prisma.tafAttempt.update({
      where: { id },
      data: updateData,
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
    const id = parsePathId(params);
    await prisma.tafAttempt.delete({
      where: { id },
    });
    await safeAutoSync(() => deleteTafAttemptFromSheet(id));
    return apiDeleted(id);
  });
}
