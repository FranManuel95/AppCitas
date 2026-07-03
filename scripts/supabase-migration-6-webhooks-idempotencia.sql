-- Migración incremental 6: idempotencia de webhooks de Stripe.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- Deduplica los eventos entrantes de Stripe (cobros y suscripciones): el id del
-- evento se registra antes de procesarlo, así un reintento o reordenamiento de
-- Stripe no vuelve a aplicar el mismo cambio.

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_createdAt_idx" ON "ProcessedWebhookEvent"("createdAt");

-- Tabla interna de la plataforma (sin businessId): RLS activada y sin políticas
-- para denegar por defecto a los roles anon/authenticated. Solo el servidor,
-- con la conexión de servicio, escribe aquí.
ALTER TABLE "ProcessedWebhookEvent" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260703163600_processed_webhook_event', now(), 1)
ON CONFLICT DO NOTHING;
