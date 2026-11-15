-- CreateTable
CREATE TABLE IF NOT EXISTS "weekly_plan_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "plan_external_id" TEXT NOT NULL,
    "planned_date" TIMESTAMP(3) NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "target_distance_km" DOUBLE PRECISION,
    "target_pace_formatted" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Planejado',
    "matched_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_plan_items_plan_external_id_key" ON "weekly_plan_items"("plan_external_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_plan_items_matched_session_id_key" ON "weekly_plan_items"("matched_session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "weekly_plan_items_planned_date_idx" ON "weekly_plan_items"("planned_date");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_items_matched_session_id_fkey'
    ) THEN
        ALTER TABLE "weekly_plan_items"
        ADD CONSTRAINT "weekly_plan_items_matched_session_id_fkey"
        FOREIGN KEY ("matched_session_id") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
