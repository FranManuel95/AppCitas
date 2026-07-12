-- Migración incremental 19: economía de la plataforma (costes editables).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

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

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712090000_economia_plataforma', now(), 1)
ON CONFLICT DO NOTHING;
