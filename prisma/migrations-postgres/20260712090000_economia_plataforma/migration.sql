-- CreateTable
CREATE TABLE "PlatformSetting" (
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

-- CreateIndex (conteo mensual de mensajes por canal para el panel de economía)
CREATE INDEX "Notification_channel_status_sentAt_idx" ON "Notification"("channel", "status", "sentAt");
