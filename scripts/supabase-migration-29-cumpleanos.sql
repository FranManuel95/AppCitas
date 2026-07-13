-- Migración incremental 29: fecha de nacimiento del cliente (segmento de
-- campañas "cumpleaños próximos").
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713110000_cumpleanos', now(), 1)
ON CONFLICT DO NOTHING;
