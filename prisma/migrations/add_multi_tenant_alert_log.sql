-- Safe Migration: Add multi-tenant support to alert_log
-- This migration preserves existing data by:
-- 1. Adding optional userId column
-- 2. Backfilling userId from first user for legacy single-tenant rows
-- 3. Adding indexes and foreign key

ALTER TABLE "alert_log" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Optional backfill for legacy rows (single-tenant assumption)
UPDATE "alert_log"
SET "userId" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "alert_log_userId_idx" ON "alert_log" ("userId");
CREATE INDEX IF NOT EXISTS "alert_log_userId_createdAt_idx" ON "alert_log" ("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alert_log_userId_fkey'
  ) THEN
    ALTER TABLE "alert_log"
    ADD CONSTRAINT "alert_log_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
