-- AlterTable
ALTER TABLE "Business" ADD COLUMN "invoicingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Invoice" (
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

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "businessId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("businessId", "series", "year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_rectifiesId_key" ON "Invoice"("rectifiesId");
CREATE UNIQUE INDEX "Invoice_businessId_series_year_number_key" ON "Invoice"("businessId", "series", "year", "number");
CREATE INDEX "Invoice_businessId_issuedAt_idx" ON "Invoice"("businessId", "issuedAt");
CREATE INDEX "Invoice_appointmentId_idx" ON "Invoice"("appointmentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
