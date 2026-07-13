-- Tarjeta de sellos: programa por negocio, tarjeta por cliente, cupón
-- personal y marcador idempotente en la cita
ALTER TABLE "Coupon" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "loyaltyStampedAt" TIMESTAMP(3);

CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stampsRequired" INTEGER NOT NULL,
    "rewardPercent" INTEGER NOT NULL,
    "rewardValidityDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyCard" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "totalStamps" INTEGER NOT NULL DEFAULT 0,
    "totalRewards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyProgram_businessId_key" ON "LoyaltyProgram"("businessId");
CREATE UNIQUE INDEX "LoyaltyCard_businessId_clientId_key" ON "LoyaltyCard"("businessId", "clientId");

ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
