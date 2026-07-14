-- Consentimiento de comunicaciones comerciales + win-back automático
ALTER TABLE "User" ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN "winbackDays" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "winbackQueuedAt" TIMESTAMP(3);
