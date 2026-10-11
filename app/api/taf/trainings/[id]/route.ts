import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const {
      sessionDate,
      activityType,
      distanceKm,
      durationSeconds,
      speedKmh,
      paceSeconds,
      paceFormatted,
      perceivedEffort,
      bodyWeightKg,
      notes,
      splits,
    } = body;

    const updated = await prisma.trainingSession.update({
      where: { id },
      data: {
        ...(sessionDate ? { sessionDate: new Date(sessionDate) } : {}),
        ...(activityType ? { activityType: String(activityType) } : {}),
        ...(distanceKm !== undefined ? { distanceKm: Number(distanceKm) } : {}),
        ...(durationSeconds !== undefined
          ? { durationSeconds: Number(durationSeconds) }
          : {}),
        ...(speedKmh !== undefined ? { speedKmh: Number(speedKmh) } : {}),
        ...(paceSeconds !== undefined ? { paceSeconds: Number(paceSeconds) } : {}),
        ...(paceFormatted !== undefined ? { paceFormatted: String(paceFormatted) } : {}),
        ...(perceivedEffort !== undefined
          ? { perceivedEffort: perceivedEffort !== null ? Number(perceivedEffort) : null }
          : {}),
        ...(bodyWeightKg !== undefined
          ? { bodyWeightKg: bodyWeightKg !== null ? Number(bodyWeightKg) : null }
          : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(splits !== undefined ? { splits: splits || [] } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar sessão de treino no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar treino no banco de dados" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.trainingSession.delete({
      where: { id },
    });
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Erro ao excluir sessão de treino no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao excluir treino no banco de dados" },
      { status: 500 }
    );
  }
}
