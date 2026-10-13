import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { UserProfileInputSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    // Aplicação mono-usuário / usuário ativo
    let profile = await prisma.userProfile.findFirst({
      include: {
        _count: {
          select: { weightRecords: true },
        },
      },
    });

    if (!profile) {
      // Se não existir perfil salvo ainda, cria ou retorna estrutura default
      profile = await prisma.userProfile.create({
        data: {
          name: null,
          heightCm: null,
          currentWeightKg: null,
          birthDate: null,
          gender: null,
        },
        include: {
          _count: {
            select: { weightRecords: true },
          },
        },
      });
    }

    return apiSuccess(profile);
  });
}

export async function PUT(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const validated = UserProfileInputSchema.parse(body);

    let profile = await prisma.userProfile.findFirst();

    const previousWeight = profile?.currentWeightKg ?? null;

    if (profile) {
      profile = await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          name: validated.name !== undefined ? validated.name : profile.name,
          heightCm: validated.heightCm !== undefined ? validated.heightCm : profile.heightCm,
          currentWeightKg:
            validated.currentWeightKg !== undefined
              ? validated.currentWeightKg
              : profile.currentWeightKg,
          birthDate:
            validated.birthDate !== undefined
              ? validated.birthDate
                ? new Date(validated.birthDate)
                : null
              : profile.birthDate,
          gender: validated.gender !== undefined ? validated.gender : profile.gender,
        },
      });
    } else {
      profile = await prisma.userProfile.create({
        data: {
          name: validated.name ?? null,
          heightCm: validated.heightCm ?? null,
          currentWeightKg: validated.currentWeightKg ?? null,
          birthDate: validated.birthDate ? new Date(validated.birthDate) : null,
          gender: validated.gender ?? null,
        },
      });
    }

    // Se o peso corporal foi informado/alterado, registrar no histórico se for um novo valor
    if (
      validated.currentWeightKg &&
      (!previousWeight || Math.abs(previousWeight - validated.currentWeightKg) > 0.01)
    ) {
      await prisma.weightRecord.create({
        data: {
          profileId: profile.id,
          weightKg: validated.currentWeightKg,
          recordedAt: new Date(),
          source: "profile_update",
          notes: "Atualizado via perfil do atleta",
        },
      });
    }

    return apiSuccess(profile);
  });
}
