-- AlterEnum
ALTER TYPE "activity_source" ADD VALUE IF NOT EXISTS 'sheets';

-- AlterTable
ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "synced_to_sheets_at" TIMESTAMP(3);

-- Manual rollback (PostgreSQL does not support DROP VALUE on enums in place):
-- ALTER TABLE "taf_attempts" DROP COLUMN IF EXISTS "synced_to_sheets_at";
