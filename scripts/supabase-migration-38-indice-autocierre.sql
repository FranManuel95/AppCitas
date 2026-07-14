-- Migración incremental 38: índice para autocierre y win-back.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

CREATE INDEX IF NOT EXISTS "Appointment_status_endAt_idx" ON "Appointment"("status", "endAt");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714090000_indice_autocierre', now(), 1)
ON CONFLICT DO NOTHING;
