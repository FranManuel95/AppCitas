-- Migración incremental 34: multi-sede (la sede pre-filtra el equipo).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

CREATE INDEX IF NOT EXISTS "Location_businessId_active_idx" ON "Location"("businessId", "active");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Location_businessId_fkey') THEN
    ALTER TABLE "Location" ADD CONSTRAINT "Location_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffMember_locationId_fkey') THEN
    ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_locationId_fkey') THEN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713160000_multi_sede', now(), 1)
ON CONFLICT DO NOTHING;
