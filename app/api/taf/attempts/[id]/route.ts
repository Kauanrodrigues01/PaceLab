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
      testDate,
      targetDurationSeconds,
      actualDurationSeconds,
      distanceMeters,
      speedKmh,
      paceSeconds,
      paceFormatted,
      locationType,
      notes,
      laps,
    } = body;

    const updated = await prisma.tafAttempt.update({
      where: { id },
      data: {
        ...(testDate ? { testDate: new Date(testDate) } : {}),
        ...(targetDurationSeconds !== undefined
          ? { targetDurationSeconds: Number(targetDurationSeconds) }
          : {}),
        ...(actualDurationSeconds !== undefined
          ? { actualDurationSeconds: Number(actualDurationSeconds) }
          : {}),
        ...(distanceMeters !== undefined
          ? { distanceMeters: Number(distanceMeters) }
          : {}),
        ...(speedKmh !== undefined ? { speedKmh: Number(speedKmh) } : {}),
        ...(paceSeconds !== undefined ? { paceSeconds: Number(paceSeconds) } : {}),
        ...(paceFormatted !== undefined ? { paceFormatted: String(paceFormatted) } : {}),
        ...(locationType !== undefined ? { locationType: locationType || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(laps !== undefined ? { laps: laps || [] } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar tentativa de TAF no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar tentativa no banco de dados" },
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
    await prisma.tafAttempt.delete({
      where: { id },
    });
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Erro ao excluir tentativa de TAF no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao excluir tentativa no banco de dados" },
      { status: 500 }
    );
  }
}
