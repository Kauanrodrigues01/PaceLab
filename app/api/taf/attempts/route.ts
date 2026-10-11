import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const attempts = await prisma.tafAttempt.findMany({
      orderBy: { testDate: "desc" },
    });
    return NextResponse.json(attempts);
  } catch (error) {
    console.error("Erro ao listar tentativas de TAF no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao consultar banco de dados" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      userId,
      testDate,
      targetDurationSeconds = 720,
      actualDurationSeconds,
      distanceMeters,
      speedKmh,
      paceSeconds,
      paceFormatted,
      locationType,
      notes,
      laps = [],
    } = body;

    if (!distanceMeters || !actualDurationSeconds) {
      return NextResponse.json(
        { error: "Distância e duração são obrigatórias" },
        { status: 400 }
      );
    }

    const created = await prisma.tafAttempt.create({
      data: {
        ...(id ? { id } : {}),
        userId: userId || null,
        testDate: testDate ? new Date(testDate) : new Date(),
        targetDurationSeconds: Number(targetDurationSeconds),
        actualDurationSeconds: Number(actualDurationSeconds),
        distanceMeters: Number(distanceMeters),
        speedKmh: Number(speedKmh),
        paceSeconds: Number(paceSeconds),
        paceFormatted: String(paceFormatted),
        locationType: locationType || null,
        notes: notes || null,
        laps: laps || [],
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar tentativa de TAF no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao registrar tentativa no banco de dados" },
      { status: 500 }
    );
  }
}
