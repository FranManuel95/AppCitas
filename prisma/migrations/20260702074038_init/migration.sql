-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "businessId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancellationFeePercent" INTEGER NOT NULL DEFAULT 100,
    "slotGranularityMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxAdvanceBookingDays" INTEGER NOT NULL DEFAULT 60,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    CONSTRAINT "BusinessHour_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    CONSTRAINT "Closure_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "priceCents" INTEGER NOT NULL,
    "chargedCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Service_businessId_active_idx" ON "Service"("businessId", "active");

-- CreateIndex
CREATE INDEX "BusinessHour_businessId_weekday_idx" ON "BusinessHour"("businessId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Closure_businessId_date_key" ON "Closure"("businessId", "date");

-- CreateIndex
CREATE INDEX "Appointment_businessId_startAt_idx" ON "Appointment"("businessId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_clientId_startAt_idx" ON "Appointment"("clientId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_businessId_status_startAt_idx" ON "Appointment"("businessId", "status", "startAt");
