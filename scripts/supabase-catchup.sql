-- ============================================================================
-- AppCitas · Catch-up idempotente para Supabase (pegar en SQL Editor y RUN)
-- ============================================================================
-- Aplica TODAS las migraciones posteriores al bootstrap inicial (2 → 7) de una
-- sola vez. Es IDEMPOTENTE: usa IF NOT EXISTS y comprobaciones, así que puedes
-- ejecutarlo aunque ya tengas algunas aplicadas — solo añade lo que falte.
--
-- Requisito: el esquema base (scripts/supabase-bootstrap.sql, migración
-- 20260702000000_init) debe estar ya aplicado (tablas Business, User,
-- Appointment…). Si la BD está vacía, ejecuta ANTES el bootstrap.
-- ============================================================================

-- ── (0) Tabla de control de migraciones (por si no existiera) ───────────────
-- El bootstrap ya la crea; se incluye con IF NOT EXISTS para que este script
-- sea autosuficiente y nunca falle por su ausencia.
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

-- ── (2) Contador de rate limiting ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);
ALTER TABLE "RateLimitCounter" ENABLE ROW LEVEL SECURITY;

-- ── (3) Cierre automático + segundo recordatorio ───────────────────────────
ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "autoCompleteEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reminder2HoursBefore" INTEGER;

-- ── (4) Reseñas post-cita ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Review_appointmentId_key" ON "Review"("appointmentId");
CREATE INDEX IF NOT EXISTS "Review_businessId_createdAt_idx" ON "Review"("businessId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_appointmentId_fkey') THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_businessId_fkey') THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_clientId_fkey') THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;

-- ── (5) Suscripción SaaS del negocio ───────────────────────────────────────
ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "planRenewsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "platformStripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'canceled',
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
-- Si la columna ya existía con el default antiguo ('trialing'), corrígelo.
ALTER TABLE "Business" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'canceled';

-- ── (6) Idempotencia de webhooks de Stripe ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX IF NOT EXISTS "ProcessedWebhookEvent_createdAt_idx" ON "ProcessedWebhookEvent"("createdAt");
ALTER TABLE "ProcessedWebhookEvent" ENABLE ROW LEVEL SECURITY;

-- ── (7) Evidencia de consentimiento (RGPD) ─────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentedAt" TIMESTAMP(3);

-- ── (8) Default de subscriptionStatus → 'canceled' ─────────────────────────
-- (ya aplicado arriba con el ALTER; este bloque solo documenta la migración 8)

-- ── (9) Índices de camino caliente ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Appointment_businessId_createdAt_idx" ON "Appointment"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "RateLimitCounter_windowStart_idx" ON "RateLimitCounter"("windowStart");

-- ── Registro en _prisma_migrations (sin duplicar si ya están) ───────────────
INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
SELECT gen_random_uuid()::text, 'manual-sql-editor', m, now(), 1
FROM (VALUES
  ('20260703073527_rate_limit_counter'),
  ('20260703080743_auto_close_y_segundo_recordatorio'),
  ('20260703082903_reviews'),
  ('20260703120017_saas_subscription'),
  ('20260703163600_processed_webhook_event'),
  ('20260703170000_consented_at'),
  ('20260704000000_subscription_default_canceled'),
  ('20260704150000_hot_path_indexes')
) AS v(m)
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" p WHERE p."migration_name" = v.m
);
