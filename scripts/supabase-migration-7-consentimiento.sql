-- Migración incremental 7: evidencia de consentimiento (RGPD).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- Guarda el instante en que el usuario aceptó los términos y la política de
-- privacidad al registrarse, como prueba del consentimiento.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentedAt" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260703170000_consented_at', now(), 1)
ON CONFLICT DO NOTHING;
