-- Migración incremental 32: membresías de clientes (cuota mensual con
-- descuento automático en las citas).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "membershipId" TEXT;

CREATE TABLE IF NOT EXISTS "MembershipPlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "maxAppointmentsPerMonth" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MembershipPlan" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ClientMembership" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "paymentSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClientMembership" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "MembershipPlan_businessId_active_idx" ON "MembershipPlan"("businessId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientMembership_stripeSubscriptionId_key" ON "ClientMembership"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "ClientMembership_businessId_clientId_idx" ON "ClientMembership"("businessId", "clientId");
CREATE INDEX IF NOT EXISTS "ClientMembership_clientId_idx" ON "ClientMembership"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MembershipPlan_businessId_fkey') THEN
    ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientMembership_businessId_fkey') THEN
    ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientMembership_planId_fkey') THEN
    ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientMembership_clientId_fkey') THEN
    ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_membershipId_fkey') THEN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713140000_membresias', now(), 1)
ON CONFLICT DO NOTHING;
