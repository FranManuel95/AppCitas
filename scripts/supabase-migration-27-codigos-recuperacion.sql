-- Migración incremental 27: códigos de recuperación del 2FA.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpRecoveryCodes" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713090000_codigos_recuperacion', now(), 1)
ON CONFLICT DO NOTHING;
