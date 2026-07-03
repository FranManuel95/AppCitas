-- Migración incremental 3: cierre automático de citas + segundo recordatorio.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "autoCompleteEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reminder2HoursBefore" INTEGER;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260703080743_auto_close_y_segundo_recordatorio', now(), 1)
ON CONFLICT DO NOTHING;
