-- Migración incremental 41: consentimiento de marketing + win-back.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "winbackDays" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "winbackQueuedAt" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714120000_consentimiento_winback', now(), 1)
ON CONFLICT DO NOTHING;
