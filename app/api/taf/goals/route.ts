import { prisma } from "@/lib/prisma";
import { withApiHandler, apiSuccess } from "@/lib/api/response";
import { TafGoalInputSchema } from "@/lib/validations/taf";

export const dynamic = "force-dynamic";

interface GoalDto {
  id?: string;
  userId?: string | null;
  targetDistanceMeters: number;
  targetDurationMinutes: number;
  targetExamDate?: Date | string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function GET() {
  return withApiHandler(async () => {
    const goal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!goal) {
      return apiSuccess<GoalDto>({
        targetDistanceMeters: 2300,
        targetDurationMinutes: 12,
        targetExamDate: null,
      });
    }

    return apiSuccess<GoalDto>(goal);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const validated = TafGoalInputSchema.parse(body);

    const existingGoal = await prisma.tafGoal.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    let savedGoal;
    if (existingGoal) {
      savedGoal = await prisma.tafGoal.update({
        where: { id: existingGoal.id },
        data: {
          targetDistanceMeters: validated.targetDistanceMeters,
          targetDurationMinutes: validated.targetDurationMinutes,
          targetExamDate: validated.targetExamDate ? new Date(validated.targetExamDate) : null,
        },
      });
    } else {
      savedGoal = await prisma.tafGoal.create({
        data: {
          targetDistanceMeters: validated.targetDistanceMeters,
          targetDurationMinutes: validated.targetDurationMinutes,
          targetExamDate: validated.targetExamDate ? new Date(validated.targetExamDate) : null,
        },
      });
    }

    return apiSuccess(savedGoal);
  });
}
