-- Migración incremental 14: señal (prepago) al reservar.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "depositPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "depositCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "depositRef" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260706090000_booking_deposit', now(), 1)
ON CONFLICT DO NOTHING;
