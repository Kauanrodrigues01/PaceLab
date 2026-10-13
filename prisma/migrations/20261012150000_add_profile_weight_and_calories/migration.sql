-- Adição de colunas de gasto calórico na tabela training_sessions
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "active_calories" DOUBLE PRECISION;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "total_calories" DOUBLE PRECISION;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "met_value" DOUBLE PRECISION;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "calorie_method" TEXT;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "calorie_source" TEXT;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "calorie_metadata" JSONB;

-- Criação da tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT,
    "height_cm" DOUBLE PRECISION,
    "current_weight_kg" DOUBLE PRECISION,
    "birth_date" TIMESTAMP(3),
    "gender" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- Criação do índice único em user_id (se houver autenticação ou multi-user no futuro)
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- Criação da tabela de histórico de pesagens
CREATE TABLE IF NOT EXISTS "weight_records" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "source" TEXT DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_records_pkey" PRIMARY KEY ("id")
);

-- Índices e Chave Estrangeira
CREATE INDEX IF NOT EXISTS "weight_records_profile_id_recorded_at_idx" ON "weight_records"("profile_id", "recorded_at" DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_records_profile_id_fkey'
    ) THEN
        ALTER TABLE "weight_records"
        ADD CONSTRAINT "weight_records_profile_id_fkey"
        FOREIGN KEY ("profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
