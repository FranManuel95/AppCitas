-- Migración incremental 20: cuentas sombra (cita manual e invitados).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guest" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712100000_invitados', now(), 1)
ON CONFLICT DO NOTHING;
