import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { TafGoalInputSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

import type { TafGoal } from "@prisma/client";

export async function GET() {
  return withApiHandler(async () => {
    const goal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!goal) {
      const defaultGoal: TafGoal = {
        id: "default",
        userId: null,
        institutionName: "Edital Padrão",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2300,
        targetDurationMinutes: 12,
        targetExamDate: null,
        pullupType: "dinamica",
        pullupMinReps: 3,
        pullupTargetReps: 5,
        pullupMinSeconds: null,
        pullupTargetSeconds: null,
        pushupMinReps: 20,
        pushupTargetReps: 30,
        pushupDurationSeconds: null,
        absMinReps: 30,
        absTargetReps: 40,
        absDurationSeconds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return apiSuccess(defaultGoal);
    }

    return apiSuccess(goal);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const validated = TafGoalInputSchema.parse(body);

    const goalData = {
      institutionName: validated.institutionName,
      minDistanceMeters: validated.minDistanceMeters,
      targetDistanceMeters: validated.targetDistanceMeters,
      targetDurationMinutes: validated.targetDurationMinutes,
      targetExamDate: validated.targetExamDate ? new Date(validated.targetExamDate) : null,
      pullupType: validated.pullupType,
      pullupMinReps: validated.pullupMinReps,
      pullupTargetReps: validated.pullupTargetReps,
      pullupMinSeconds: validated.pullupMinSeconds,
      pullupTargetSeconds: validated.pullupTargetSeconds,
      pushupMinReps: validated.pushupMinReps,
      pushupTargetReps: validated.pushupTargetReps,
      pushupDurationSeconds: validated.pushupDurationSeconds,
      absMinReps: validated.absMinReps,
      absTargetReps: validated.absTargetReps,
      absDurationSeconds: validated.absDurationSeconds,
    };

    const existingGoal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    let savedGoal;
    if (existingGoal) {
      savedGoal = await prisma.tafGoal.update({
        where: { id: existingGoal.id },
        data: goalData,
      });
    } else {
      savedGoal = await prisma.tafGoal.create({
        data: goalData,
      });
    }

    return apiSuccess(savedGoal);
  });
}
