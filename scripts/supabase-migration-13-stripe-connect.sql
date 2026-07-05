-- Migración incremental 13: Stripe Connect (cuenta conectada del negocio).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeAccountStatus" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260705130000_stripe_connect', now(), 1)
ON CONFLICT DO NOTHING;
