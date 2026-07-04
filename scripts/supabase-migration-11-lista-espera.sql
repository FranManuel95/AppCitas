-- Migración incremental 11: lista de espera.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- Un cliente se apunta para un servicio en un día; al cancelarse una cita de
-- ese negocio+servicio+día se le avisa del hueco liberado.

CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT,
    "desiredDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WaitlistEntry_businessId_serviceId_desiredDate_status_idx" ON "WaitlistEntry"("businessId", "serviceId", "desiredDate", "status");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_clientId_status_idx" ON "WaitlistEntry"("clientId", "status");

-- Claves foráneas (idempotentes: se omiten si ya existen).
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: coherente con el resto de tablas (acceso solo vía service role del server).
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260704170000_waitlist', now(), 1)
ON CONFLICT DO NOTHING;
