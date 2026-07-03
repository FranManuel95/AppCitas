-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "planRenewsAt" TIMESTAMP(3),
ADD COLUMN     "platformStripeCustomerId" TEXT,
ADD COLUMN     "platformStripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

