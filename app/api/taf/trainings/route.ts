import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trainings = await prisma.trainingSession.findMany({
      orderBy: { sessionDate: "desc" },
    });
    return NextResponse.json(trainings);
  } catch (error) {
    console.error("Erro ao listar sessões de treino no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao consultar treinos no banco de dados" },
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
      sessionDate,
      activityType = "corrida_continua",
      distanceKm,
      durationSeconds,
      speedKmh,
      paceSeconds,
      paceFormatted,
      perceivedEffort,
      bodyWeightKg,
      notes,
      splits = [],
    } = body;

    if (distanceKm === undefined || durationSeconds === undefined) {
      return NextResponse.json(
        { error: "Distância e duração do treino são obrigatórias" },
        { status: 400 }
      );
    }

    const created = await prisma.trainingSession.create({
      data: {
        ...(id ? { id } : {}),
        userId: userId || null,
        sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
        activityType: String(activityType),
        distanceKm: Number(distanceKm),
        durationSeconds: Number(durationSeconds),
        speedKmh: Number(speedKmh),
        paceSeconds: Number(paceSeconds),
        paceFormatted: String(paceFormatted),
        perceivedEffort:
          perceivedEffort !== undefined && perceivedEffort !== null
            ? Number(perceivedEffort)
            : null,
        bodyWeightKg:
          bodyWeightKg !== undefined && bodyWeightKg !== null
            ? Number(bodyWeightKg)
            : null,
        notes: notes || null,
        splits: splits || [],
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar sessão de treino no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao registrar treino no banco de dados" },
      { status: 500 }
    );
  }
}
