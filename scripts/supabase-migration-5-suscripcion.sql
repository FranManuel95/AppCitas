-- Migración incremental 5: suscripción SaaS (plan de cada negocio).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "planRenewsAt" TIMESTAMP(3),
ADD COLUMN     "platformStripeCustomerId" TEXT,
ADD COLUMN     "platformStripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);


INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260703120017_saas_subscription', now(), 1)
ON CONFLICT DO NOTHING;
