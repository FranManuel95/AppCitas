-- Migración incremental 8: el default de subscriptionStatus pasa a 'canceled'.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- Un negocio sin suscripción explícita ya no figura "en prueba" (trialing);
-- register-business fija pro/trialing +14 días en el alta real, así que el
-- default solo aplica a filas creadas sin valor.

-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'canceled';

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260704000000_subscription_default_canceled', now(), 1)
ON CONFLICT DO NOTHING;
