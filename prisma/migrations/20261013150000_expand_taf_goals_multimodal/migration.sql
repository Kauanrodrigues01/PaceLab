-- AlterTable
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "institution_name" TEXT DEFAULT 'Edital Padrão';
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "min_distance_meters" INTEGER NOT NULL DEFAULT 2400;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pullup_type" TEXT DEFAULT 'dinamica';
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pullup_min_reps" INTEGER DEFAULT 3;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pullup_target_reps" INTEGER DEFAULT 5;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pullup_min_seconds" INTEGER;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pullup_target_seconds" INTEGER;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pushup_min_reps" INTEGER DEFAULT 20;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pushup_target_reps" INTEGER DEFAULT 30;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "pushup_duration_seconds" INTEGER;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "abs_min_reps" INTEGER DEFAULT 30;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "abs_target_reps" INTEGER DEFAULT 40;
ALTER TABLE "taf_goals" ADD COLUMN IF NOT EXISTS "abs_duration_seconds" INTEGER;
