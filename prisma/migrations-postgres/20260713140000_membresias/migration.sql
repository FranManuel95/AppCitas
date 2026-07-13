-- Membresías de clientes: plan por negocio + suscripción por cliente,
-- snapshot del beneficio en la cita
ALTER TABLE "Appointment" ADD COLUMN "membershipId" TEXT;

CREATE TABLE "MembershipPlan" (
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

CREATE TABLE "ClientMembership" (
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

CREATE INDEX "MembershipPlan_businessId_active_idx" ON "MembershipPlan"("businessId", "active");
CREATE UNIQUE INDEX "ClientMembership_stripeSubscriptionId_key" ON "ClientMembership"("stripeSubscriptionId");
CREATE INDEX "ClientMembership_businessId_clientId_idx" ON "ClientMembership"("businessId", "clientId");
CREATE INDEX "ClientMembership_clientId_idx" ON "ClientMembership"("clientId");

ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
