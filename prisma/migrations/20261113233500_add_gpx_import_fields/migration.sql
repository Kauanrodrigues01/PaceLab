-- 1. Criação do enum ActivitySource (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_source') THEN
        CREATE TYPE "activity_source" AS ENUM ('manual', 'gpx_upload');
    END IF;
END $$;

-- 2. Expansão aditiva do enum ActivityType (novas modalidades de corrida)
ALTER TYPE "activity_type" ADD VALUE IF NOT EXISTS 'rodagem_leve';
ALTER TYPE "activity_type" ADD VALUE IF NOT EXISTS 'tempo_run';
ALTER TYPE "activity_type" ADD VALUE IF NOT EXISTS 'longao';

-- 3. Evolução da tabela taf_attempts (rastreabilidade e telemetria opcionais)
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "source" "activity_source" NOT NULL DEFAULT 'manual';
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "shoe_name" TEXT;
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "avg_heart_rate" INTEGER;
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "max_heart_rate" INTEGER;

-- 4. Evolução da tabela training_sessions (rastreabilidade e telemetria opcionais)
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "source" "activity_source" NOT NULL DEFAULT 'manual';
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "synced_to_sheets_at" TIMESTAMP(3);
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "elapsed_seconds" INTEGER;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "avg_heart_rate" INTEGER;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "max_heart_rate" INTEGER;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "elevation_gain_m" DOUBLE PRECISION;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "avg_cadence" INTEGER;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "shoe_name" TEXT;

-- 5. Alinhamento de defaults pendentes de migrations anteriores (zero drift)
ALTER TABLE "taf_goals" ALTER COLUMN "target_distance_meters" SET DEFAULT 2600;
ALTER TABLE "user_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- 6. Índices únicos para anti-duplicação (permitem múltiplos NULLs no PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "taf_attempts_external_id_key" ON "taf_attempts"("external_id");
CREATE UNIQUE INDEX IF NOT EXISTS "training_sessions_external_id_key" ON "training_sessions"("external_id");

-- ─── ROLLBACK MANUAL (se necessário reverter esta migration) ────────────────
-- DROP INDEX IF EXISTS "training_sessions_external_id_key";
-- DROP INDEX IF EXISTS "taf_attempts_external_id_key";
-- ALTER TABLE "training_sessions"
--   DROP COLUMN IF EXISTS "shoe_name",
--   DROP COLUMN IF EXISTS "avg_cadence",
--   DROP COLUMN IF EXISTS "elevation_gain_m",
--   DROP COLUMN IF EXISTS "max_heart_rate",
--   DROP COLUMN IF EXISTS "avg_heart_rate",
--   DROP COLUMN IF EXISTS "elapsed_seconds",
--   DROP COLUMN IF EXISTS "synced_to_sheets_at",
--   DROP COLUMN IF EXISTS "external_id",
--   DROP COLUMN IF EXISTS "source";
-- ALTER TABLE "taf_attempts"
--   DROP COLUMN IF EXISTS "max_heart_rate",
--   DROP COLUMN IF EXISTS "avg_heart_rate",
--   DROP COLUMN IF EXISTS "shoe_name",
--   DROP COLUMN IF EXISTS "external_id",
--   DROP COLUMN IF EXISTS "source";
-- DROP TYPE IF EXISTS "activity_source";
-- (Valores de enum em activity_type permanecem pois são inofensivos no PostgreSQL)
