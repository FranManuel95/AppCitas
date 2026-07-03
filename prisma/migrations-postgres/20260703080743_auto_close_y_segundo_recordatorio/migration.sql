-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "autoCompleteEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminder2HoursBefore" INTEGER;
