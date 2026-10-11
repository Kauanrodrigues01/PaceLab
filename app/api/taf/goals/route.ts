import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const goal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!goal) {
      return NextResponse.json({
        targetDistanceMeters: 2300,
        targetDurationMinutes: 12,
        targetExamDate: null,
      });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Erro ao buscar meta no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao conectar com o banco de dados" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetDistanceMeters = 2300, targetDurationMinutes = 12, targetExamDate = null } = body;

    const existingGoal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    let savedGoal;
    if (existingGoal) {
      savedGoal = await prisma.tafGoal.update({
        where: { id: existingGoal.id },
        data: {
          targetDistanceMeters: Number(targetDistanceMeters),
          targetDurationMinutes: Number(targetDurationMinutes),
          targetExamDate: targetExamDate ? new Date(targetExamDate) : null,
        },
      });
    } else {
      savedGoal = await prisma.tafGoal.create({
        data: {
          targetDistanceMeters: Number(targetDistanceMeters),
          targetDurationMinutes: Number(targetDurationMinutes),
          targetExamDate: targetExamDate ? new Date(targetExamDate) : null,
        },
      });
    }

    return NextResponse.json(savedGoal);
  } catch (error) {
    console.error("Erro ao salvar meta no Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao salvar meta no banco de dados" },
      { status: 500 }
    );
  }
}
