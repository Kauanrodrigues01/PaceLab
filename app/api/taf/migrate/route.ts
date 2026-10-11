import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TafAttempt, TrainingSession, TafGoalConfig } from "@/types";

export const dynamic = "force-dynamic";

interface MigratePayload {
  goal?: TafGoalConfig;
  attempts?: TafAttempt[];
  trainings?: TrainingSession[];
}

export async function POST(request: Request) {
  try {
    const body: MigratePayload = await request.json();
    const { goal, attempts = [], trainings = [] } = body;

    let goalUpdated = false;
    let migratedAttempts = 0;
    let migratedTrainings = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Migração de Meta
      if (goal) {
        const existing = await tx.tafGoal.findFirst();
        if (existing) {
          await tx.tafGoal.update({
            where: { id: existing.id },
            data: {
              targetDistanceMeters: Number(goal.targetDistanceMeters || 2300),
              targetDurationMinutes: Number(goal.targetDurationMinutes || 12),
              targetExamDate: goal.targetExamDate ? new Date(goal.targetExamDate) : null,
            },
          });
        } else {
          await tx.tafGoal.create({
            data: {
              targetDistanceMeters: Number(goal.targetDistanceMeters || 2300),
              targetDurationMinutes: Number(goal.targetDurationMinutes || 12),
              targetExamDate: goal.targetExamDate ? new Date(goal.targetExamDate) : null,
            },
          });
        }
        goalUpdated = true;
      }

      // 2. Migração de Tentativas de TAF
      for (const att of attempts) {
        if (!att.distanceMeters || !att.actualDurationSeconds) continue;

        const lapsJson = (att.laps as unknown as Prisma.InputJsonValue) ?? [];

        await tx.tafAttempt.upsert({
          where: { id: att.id },
          update: {
            testDate: att.testDate ? new Date(att.testDate) : new Date(),
            targetDurationSeconds: Number(att.targetDurationSeconds || 720),
            actualDurationSeconds: Number(att.actualDurationSeconds),
            distanceMeters: Number(att.distanceMeters),
            speedKmh: Number(att.speedKmh),
            paceSeconds: Number(att.paceSeconds),
            paceFormatted: String(att.paceFormatted),
            locationType: att.locationType || null,
            notes: att.notes || null,
            laps: lapsJson,
          },
          create: {
            id: att.id,
            testDate: att.testDate ? new Date(att.testDate) : new Date(),
            targetDurationSeconds: Number(att.targetDurationSeconds || 720),
            actualDurationSeconds: Number(att.actualDurationSeconds),
            distanceMeters: Number(att.distanceMeters),
            speedKmh: Number(att.speedKmh),
            paceSeconds: Number(att.paceSeconds),
            paceFormatted: String(att.paceFormatted),
            locationType: att.locationType || null,
            notes: att.notes || null,
            laps: lapsJson,
          },
        });
        migratedAttempts++;
      }

      // 3. Migração de Sessões de Treino
      for (const tr of trainings) {
        if (tr.distanceKm === undefined || tr.durationSeconds === undefined) continue;

        const splitsJson = (tr.splits as unknown as Prisma.InputJsonValue) ?? [];

        await tx.trainingSession.upsert({
          where: { id: tr.id },
          update: {
            sessionDate: tr.sessionDate ? new Date(tr.sessionDate) : new Date(),
            activityType: String(tr.activityType || "corrida_continua"),
            distanceKm: Number(tr.distanceKm),
            durationSeconds: Number(tr.durationSeconds),
            speedKmh: Number(tr.speedKmh),
            paceSeconds: Number(tr.paceSeconds),
            paceFormatted: String(tr.paceFormatted),
            perceivedEffort:
              tr.perceivedEffort !== undefined && tr.perceivedEffort !== null
                ? Number(tr.perceivedEffort)
                : null,
            bodyWeightKg:
              tr.bodyWeightKg !== undefined && tr.bodyWeightKg !== null
                ? Number(tr.bodyWeightKg)
                : null,
            notes: tr.notes || null,
            splits: splitsJson,
          },
          create: {
            id: tr.id,
            sessionDate: tr.sessionDate ? new Date(tr.sessionDate) : new Date(),
            activityType: String(tr.activityType || "corrida_continua"),
            distanceKm: Number(tr.distanceKm),
            durationSeconds: Number(tr.durationSeconds),
            speedKmh: Number(tr.speedKmh),
            paceSeconds: Number(tr.paceSeconds),
            paceFormatted: String(tr.paceFormatted),
            perceivedEffort:
              tr.perceivedEffort !== undefined && tr.perceivedEffort !== null
                ? Number(tr.perceivedEffort)
                : null,
            bodyWeightKg:
              tr.bodyWeightKg !== undefined && tr.bodyWeightKg !== null
                ? Number(tr.bodyWeightKg)
                : null,
            notes: tr.notes || null,
            splits: splitsJson,
          },
        });
        migratedTrainings++;
      }
    });

    return NextResponse.json({
      success: true,
      migratedAttempts,
      migratedTrainings,
      goalUpdated,
    });
  } catch (error) {
    console.error("Erro na migração para o Prisma:", error);
    return NextResponse.json(
      { error: "Falha ao migrar dados para o banco de dados SQL" },
      { status: 500 }
    );
  }
}
