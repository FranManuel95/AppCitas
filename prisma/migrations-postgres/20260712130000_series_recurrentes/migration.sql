-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_seriesId_idx" ON "Appointment"("seriesId");
