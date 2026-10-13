import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { CreateWeightRecordSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const profile = await prisma.userProfile.findFirst();

    if (!profile) {
      return apiSuccess([]);
    }

    const records = await prisma.weightRecord.findMany({
      where: { profileId: profile.id },
      orderBy: { recordedAt: "desc" },
    });

    return apiSuccess(records);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const validated = CreateWeightRecordSchema.parse(body);

    let profile = await prisma.userProfile.findFirst();

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          currentWeightKg: validated.weightKg,
        },
      });
    }

    const recordDate = validated.recordedAt ? new Date(validated.recordedAt) : new Date();

    const record = await prisma.weightRecord.create({
      data: {
        profileId: profile.id,
        weightKg: validated.weightKg,
        recordedAt: recordDate,
        notes: validated.notes || null,
        source: validated.source || "manual",
      },
    });

    // Se esta pesagem for a mais recente ou recente no tempo, atualizar o perfil
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

    return apiSuccess(record, 201);
  });
}
