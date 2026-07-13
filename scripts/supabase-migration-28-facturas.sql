-- Migración incremental 28: facturas fiscales con numeración correlativa.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

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

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713100000_facturas', now(), 1)
ON CONFLICT DO NOTHING;
