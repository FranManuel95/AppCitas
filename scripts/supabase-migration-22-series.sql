-- Migración incremental 22: citas recurrentes (series).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;

CREATE INDEX IF NOT EXISTS "Appointment_seriesId_idx" ON "Appointment"("seriesId");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712130000_series_recurrentes', now(), 1)
ON CONFLICT DO NOTHING;
