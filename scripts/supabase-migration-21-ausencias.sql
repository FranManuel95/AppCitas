-- Migración incremental 21: ausencias por empleado (vacaciones, baja).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

CREATE TABLE IF NOT EXISTS "StaffTimeOff" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTimeOff_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffTimeOff" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "StaffTimeOff_staffId_startDate_endDate_idx" ON "StaffTimeOff"("staffId", "startDate", "endDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffTimeOff_staffId_fkey'
  ) THEN
    ALTER TABLE "StaffTimeOff" ADD CONSTRAINT "StaffTimeOff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712120000_ausencias_empleado', now(), 1)
ON CONFLICT DO NOTHING;
