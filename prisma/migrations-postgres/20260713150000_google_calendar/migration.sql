-- Google Calendar bidireccional: conexiones OAuth (tokens cifrados), enlaces
-- cita→evento, outbox de sincronización y caché corta de freebusy
CREATE TABLE "CalendarConnection" (
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

CREATE TABLE "CalendarEventLink" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSyncJob" (
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

CREATE TABLE "CalendarBusyCache" (
    "connectionId" TEXT NOT NULL,
    "dateISO" TEXT NOT NULL,
    "busyJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBusyCache_pkey" PRIMARY KEY ("connectionId", "dateISO")
);

CREATE UNIQUE INDEX "CalendarConnection_staffId_key" ON "CalendarConnection"("staffId");
CREATE INDEX "CalendarConnection_businessId_idx" ON "CalendarConnection"("businessId");
CREATE UNIQUE INDEX "CalendarEventLink_appointmentId_connectionId_key" ON "CalendarEventLink"("appointmentId", "connectionId");
CREATE INDEX "CalendarSyncJob_status_scheduledFor_idx" ON "CalendarSyncJob"("status", "scheduledFor");

ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarBusyCache" ADD CONSTRAINT "CalendarBusyCache_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
