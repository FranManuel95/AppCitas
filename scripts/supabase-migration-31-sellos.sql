-- Migración incremental 31: tarjeta de sellos (fidelización).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "loyaltyStampedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "LoyaltyProgram" (
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

ALTER TABLE "LoyaltyProgram" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "LoyaltyCard" (
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

ALTER TABLE "LoyaltyCard" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyProgram_businessId_key" ON "LoyaltyProgram"("businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyCard_businessId_clientId_key" ON "LoyaltyCard"("businessId", "clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyProgram_businessId_fkey') THEN
    ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyCard_businessId_fkey') THEN
    ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyCard_clientId_fkey') THEN
    ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713130000_tarjeta_sellos', now(), 1)
ON CONFLICT DO NOTHING;
