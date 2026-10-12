-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('corrida_continua', 'corrida_intervalada', 'caminhada');

-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('pista_400m', 'rua_plana', 'parque_praca', 'esteira', 'outro');

-- CreateTable
CREATE TABLE "taf_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "target_distance_meters" INTEGER NOT NULL DEFAULT 2300,
    "target_duration_minutes" INTEGER NOT NULL DEFAULT 12,
    "target_exam_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taf_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taf_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "test_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_duration_seconds" INTEGER NOT NULL DEFAULT 720,
    "actual_duration_seconds" INTEGER NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "speed_kmh" DOUBLE PRECISION NOT NULL,
    "pace_seconds" INTEGER NOT NULL,
    "pace_formatted" TEXT NOT NULL,
    "location_type" "location_type",
    "notes" TEXT,
    "laps" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taf_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activity_type" "activity_type" NOT NULL DEFAULT 'corrida_continua',
    "distance_km" DOUBLE PRECISION NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "speed_kmh" DOUBLE PRECISION NOT NULL,
    "pace_seconds" INTEGER NOT NULL,
    "pace_formatted" TEXT NOT NULL,
    "perceived_effort" INTEGER,
    "body_weight_kg" DOUBLE PRECISION,
    "notes" TEXT,
    "splits" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taf_attempts_user_id_test_date_idx" ON "taf_attempts"("user_id", "test_date" DESC);

-- CreateIndex
CREATE INDEX "taf_attempts_user_id_target_duration_seconds_idx" ON "taf_attempts"("user_id", "target_duration_seconds");

-- CreateIndex
CREATE INDEX "training_sessions_user_id_session_date_idx" ON "training_sessions"("user_id", "session_date" DESC);

-- CreateIndex
CREATE INDEX "training_sessions_user_id_activity_type_idx" ON "training_sessions"("user_id", "activity_type");
