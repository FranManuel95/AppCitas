-- Migración incremental 26: verificación en dos pasos (TOTP).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712170000_totp_2fa', now(), 1)
ON CONFLICT DO NOTHING;
