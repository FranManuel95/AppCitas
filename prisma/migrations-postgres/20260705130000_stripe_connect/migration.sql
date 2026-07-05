-- AlterTable
ALTER TABLE "Business" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "Business" ADD COLUMN "stripeAccountStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Business" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
