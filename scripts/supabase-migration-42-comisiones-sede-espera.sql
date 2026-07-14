-- Migración incremental 42: comisiones por empleado + lista de espera por sede.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "commissionPercent" INTEGER;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WaitlistEntry_locationId_fkey') THEN
    ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714130000_comisiones_sede_espera', now(), 1)
ON CONFLICT DO NOTHING;
