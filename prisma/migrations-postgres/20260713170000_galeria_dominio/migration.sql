-- Galería de trabajos + dominio propio por negocio
ALTER TABLE "Business" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "Business_customDomain_key" ON "Business"("customDomain");

CREATE TABLE "BusinessPhoto" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessPhoto_businessId_position_idx" ON "BusinessPhoto"("businessId", "position");

ALTER TABLE "BusinessPhoto" ADD CONSTRAINT "BusinessPhoto_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
