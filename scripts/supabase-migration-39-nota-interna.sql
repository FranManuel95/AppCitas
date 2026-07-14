-- Migración incremental 39: nota interna del equipo por cita.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714100000_nota_interna', now(), 1)
ON CONFLICT DO NOTHING;
