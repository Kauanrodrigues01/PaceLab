import { prisma } from "@/lib/prisma";
import { apiDeleted, apiNotFound, withApiHandler } from "@/lib/api/response";
import { parsePathId } from "@/lib/api/request";
import { safeAutoSync, syncProfileAndGoalToSheet } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const id = parsePathId(params);

    const record = await prisma.weightRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return apiNotFound("Registro de pesagem não encontrado no banco de dados");
    }

    await prisma.weightRecord.delete({
      where: { id },
    });

    const profile = await prisma.userProfile.findUnique({
      where: { id: record.profileId },
    });

    if (profile) {
      const remainingLatest = await prisma.weightRecord.findFirst({
        where: { profileId: profile.id },
        orderBy: { recordedAt: "desc" },
      });

      await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          currentWeightKg: remainingLatest ? remainingLatest.weightKg : null,
        },
      });
    }

    await safeAutoSync(() => syncProfileAndGoalToSheet());

    return apiDeleted(id);
  });
}
