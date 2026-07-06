-- AlterTable
ALTER TABLE "Business" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "depositCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "depositStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Appointment" ADD COLUMN "depositRef" TEXT;
