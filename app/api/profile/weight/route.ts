import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/api/response";
import { parseJsonBody, parseQueryParams } from "@/lib/api/request";
import { safeAutoSync, syncProfileAndGoalToSheet } from "@/lib/googleSheets";
import {
  CreateWeightRecordSchema,
  WeightListQuerySchema,
} from "@/lib/validations/taf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { limit } = parseQueryParams(request, WeightListQuerySchema);

    const profile = await prisma.userProfile.findFirst();

    if (!profile) {
      return apiSuccess([]);
    }

    const records = await prisma.weightRecord.findMany({
      where: { profileId: profile.id },
      orderBy: { recordedAt: "desc" },
      take: limit,
    });

    return apiSuccess(records);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const { data: validated } = await parseJsonBody(
      request,
      CreateWeightRecordSchema
    );

    let profile = await prisma.userProfile.findFirst();

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          currentWeightKg: validated.weightKg,
        },
      });
    }

    const recordDate = validated.recordedAt
      ? new Date(validated.recordedAt)
      : new Date();

    const record = await prisma.weightRecord.create({
      data: {
        profileId: profile.id,
        weightKg: validated.weightKg,
        recordedAt: recordDate,
        notes: validated.notes || null,
        source: validated.source || "manual",
      },
    });

    const latestRecord = await prisma.weightRecord.findFirst({
      where: { profileId: profile.id },
      orderBy: { recordedAt: "desc" },
    });

    if (latestRecord && latestRecord.id === record.id) {
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { currentWeightKg: validated.weightKg },
      });
    }

    await safeAutoSync(() => syncProfileAndGoalToSheet());

    return apiSuccess(record, 201);
  });
}
