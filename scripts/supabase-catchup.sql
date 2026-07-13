-- ============================================================================
-- AppCitas · Catch-up idempotente para Supabase (pegar en SQL Editor y RUN)
-- ============================================================================
-- Aplica TODAS las migraciones posteriores al bootstrap inicial (2 → 11) de una
-- sola vez: rate limit, autocierre/2º recordatorio, reseñas, suscripción SaaS,
-- idempotencia de webhooks, consentimiento (RGPD), default de suscripción,
-- índices de camino caliente, trigramas de búsqueda y lista de espera.
-- Es IDEMPOTENTE: usa IF NOT EXISTS y comprobaciones, así que puedes
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
-- Misma postura que el resto: RLS activo (idempotente, no molesta si ya lo está).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

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

-- ── (10) Índices de trigramas para la búsqueda de la landing ─────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Business_name_trgm_idx" ON "Business" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Business_description_trgm_idx" ON "Business" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Business_address_trgm_idx" ON "Business" USING GIN ("address" gin_trgm_ops);

-- ── (11) Lista de espera ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT,
    "desiredDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WaitlistEntry_businessId_serviceId_desiredDate_status_idx" ON "WaitlistEntry"("businessId", "serviceId", "desiredDate", "status");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_clientId_status_idx" ON "WaitlistEntry"("clientId", "status");
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;

-- ── (12) Forma de pago de la cita (efectivo / tarjeta) ──────────────────────
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

-- ── (13) Stripe Connect: cuenta conectada del negocio ───────────────────────
ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeAccountStatus" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ── (14) Señal (prepago) al reservar ─────────────────────────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "depositPercent" INTEGER NOT NULL DEFAULT 0;

-- ── (15) Descuento de última hora ────────────────────────────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "lastMinuteDiscountPercent" INTEGER NOT NULL DEFAULT 0;

-- ── (16) Modo privado del marketplace ────────────────────────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "listedInMarketplace" BOOLEAN NOT NULL DEFAULT true;

-- ── (17) Notas privadas de cliente (CRM) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ClientNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientNote_businessId_clientId_createdAt_idx" ON "ClientNote"("businessId", "clientId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ClientNote" ENABLE ROW LEVEL SECURITY;

-- ── (18) Campañas de marketing ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Campaign_businessId_createdAt_idx" ON "Campaign"("businessId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;

-- ── (19) Economía de la plataforma ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "fixedMonthlyCostCents" INTEGER NOT NULL DEFAULT 0,
    "whatsappMsgCostCents" INTEGER NOT NULL DEFAULT 5,
    "smsMsgCostCents" INTEGER NOT NULL DEFAULT 8,
    "stripeFeeBps" INTEGER NOT NULL DEFAULT 140,
    "stripeFeeFixedCents" INTEGER NOT NULL DEFAULT 25,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PlatformSetting" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "Notification_channel_status_sentAt_idx" ON "Notification"("channel", "status", "sentAt");

-- ── (20) Cuentas sombra: cita manual del negocio e invitados ─────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "depositCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "depositRef" TEXT;

-- ── (21) Ausencias por empleado (vacaciones, baja) ───────────────────────────
CREATE TABLE IF NOT EXISTS "StaffTimeOff" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffTimeOff_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StaffTimeOff" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "StaffTimeOff_staffId_startDate_endDate_idx" ON "StaffTimeOff"("staffId", "startDate", "endDate");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffTimeOff_staffId_fkey'
  ) THEN
    ALTER TABLE "StaffTimeOff" ADD CONSTRAINT "StaffTimeOff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── (22) Citas recurrentes (series) ──────────────────────────────────────────
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
CREATE INDEX IF NOT EXISTS "Appointment_seriesId_idx" ON "Appointment"("seriesId");

-- ── (23) Feed iCal privado de la agenda (Google/Outlook) ─────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "icsFeedToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Business_icsFeedToken_key" ON "Business"("icsFeedToken");

-- ── (24) Marca por negocio: color y logo (página pública y widget) ───────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- ── (25) Notificaciones push web (PWA) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey'
  ) THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── (26) Verificación en dos pasos (TOTP) ────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3);

-- ── (27) Códigos de recuperación del 2FA ─────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpRecoveryCodes" TEXT;

-- ── (28) Facturas fiscales con numeración correlativa ────────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "invoicingEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "series" TEXT NOT NULL DEFAULT 'F',
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessTaxId" TEXT,
    "businessAddress" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "taxPercent" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "rectifiesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS "InvoiceCounter" (
    "businessId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("businessId", "series", "year")
);
ALTER TABLE "InvoiceCounter" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_rectifiesId_key" ON "Invoice"("rectifiesId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_businessId_series_year_number_key" ON "Invoice"("businessId", "series", "year", "number");
CREATE INDEX IF NOT EXISTS "Invoice_businessId_issuedAt_idx" ON "Invoice"("businessId", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_appointmentId_idx" ON "Invoice"("appointmentId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_businessId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_appointmentId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── (29) Fecha de nacimiento (segmento de cumpleaños) ────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);

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
  ('20260704150000_hot_path_indexes'),
  ('20260704160000_search_trgm_indexes'),
  ('20260704170000_waitlist'),
  ('20260705120000_payment_method'),
  ('20260705130000_stripe_connect'),
  ('20260706090000_booking_deposit'),
  ('20260706100000_last_minute_discount'),
  ('20260706110000_marketplace_privacy'),
  ('20260706120000_client_notes'),
  ('20260706130000_campaigns'),
  ('20260712090000_economia_plataforma'),
  ('20260712100000_invitados'),
  ('20260712120000_ausencias_empleado'),
  ('20260712130000_series_recurrentes'),
  ('20260712140000_feed_calendario'),
  ('20260712150000_marca_negocio'),
  ('20260712160000_push_web'),
  ('20260712170000_totp_2fa'),
  ('20260713090000_codigos_recuperacion'),
  ('20260713100000_facturas'),
  ('20260713110000_cumpleanos')
) AS v(m)
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" p WHERE p."migration_name" = v.m
);
