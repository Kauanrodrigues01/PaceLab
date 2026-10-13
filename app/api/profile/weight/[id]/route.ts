import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return withApiHandler(async () => {
    const { id } = params;

    const record = await prisma.weightRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return apiSuccess({ success: true, deletedId: id });
    }

    await prisma.weightRecord.delete({
      where: { id },
    });

    // Se houver perfil vinculado, verificar se o peso atual precisa ser recalculado
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

    return apiSuccess({ success: true, deletedId: id });
  });
}
