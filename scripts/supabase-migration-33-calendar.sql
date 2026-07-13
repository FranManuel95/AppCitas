-- Migración incremental 33: Google Calendar bidireccional (conexiones OAuth
-- con tokens cifrados, eventos, outbox de sincronización y caché de freebusy).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
CREATE TABLE IF NOT EXISTS "CalendarConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "googleEmail" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "syncOutbound" BOOLEAN NOT NULL DEFAULT true,
    "syncInbound" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarEventLink" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarSyncJob" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarBusyCache" (
    "connectionId" TEXT NOT NULL,
    "dateISO" TEXT NOT NULL,
    "busyJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBusyCache_pkey" PRIMARY KEY ("connectionId", "dateISO")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_staffId_key" ON "CalendarConnection"("staffId");
CREATE INDEX IF NOT EXISTS "CalendarConnection_businessId_idx" ON "CalendarConnection"("businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEventLink_appointmentId_connectionId_key" ON "CalendarEventLink"("appointmentId", "connectionId");
CREATE INDEX IF NOT EXISTS "CalendarSyncJob_status_scheduledFor_idx" ON "CalendarSyncJob"("status", "scheduledFor");
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEventLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarSyncJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarBusyCache" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarConnection_businessId_fkey') THEN
    ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarConnection_staffId_fkey') THEN
    ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEventLink_appointmentId_fkey') THEN
    ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEventLink_connectionId_fkey') THEN
    ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarSyncJob_appointmentId_fkey') THEN
    ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarSyncJob_connectionId_fkey') THEN
    ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarBusyCache_connectionId_fkey') THEN
    ALTER TABLE "CalendarBusyCache" ADD CONSTRAINT "CalendarBusyCache_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713150000_google_calendar', now(), 1)
ON CONFLICT DO NOTHING;
