-- Migración incremental 35: galería de trabajos + dominio propio.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Business_customDomain_key" ON "Business"("customDomain");

CREATE TABLE IF NOT EXISTS "BusinessPhoto" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessPhoto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BusinessPhoto" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "BusinessPhoto_businessId_position_idx" ON "BusinessPhoto"("businessId", "position");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessPhoto_businessId_fkey') THEN
    ALTER TABLE "BusinessPhoto" ADD CONSTRAINT "BusinessPhoto_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713170000_galeria_dominio', now(), 1)
ON CONFLICT DO NOTHING;
