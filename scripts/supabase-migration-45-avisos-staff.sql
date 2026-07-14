-- Migración incremental 45: avisos al equipo de reservas y cancelaciones.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "notifyStaffEvents" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260715100000_avisos_staff', now(), 1)
ON CONFLICT DO NOTHING;
