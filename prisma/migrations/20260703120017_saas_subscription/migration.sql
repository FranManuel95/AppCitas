-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
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
    "requireCardToBook" BOOLEAN NOT NULL DEFAULT false,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 26,
    "reminder2HoursBefore" INTEGER,
    "autoCompleteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyBySms" BOOLEAN NOT NULL DEFAULT false,
    "notifyByWhatsapp" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
    "trialEndsAt" DATETIME,
    "planRenewsAt" DATETIME,
    "platformStripeCustomerId" TEXT,
    "platformStripeSubscriptionId" TEXT,
    "taxId" TEXT,
    "taxPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("active", "address", "autoCompleteEnabled", "cancellationWindowHours", "category", "createdAt", "currency", "description", "email", "id", "lateCancellationFeePercent", "maxAdvanceBookingDays", "minNoticeMinutes", "name", "notifyByEmail", "notifyBySms", "notifyByWhatsapp", "phone", "reminder2HoursBefore", "reminderHoursBefore", "remindersEnabled", "requireCardToBook", "slotGranularityMinutes", "slug", "taxId", "taxPercent", "timezone", "updatedAt") SELECT "active", "address", "autoCompleteEnabled", "cancellationWindowHours", "category", "createdAt", "currency", "description", "email", "id", "lateCancellationFeePercent", "maxAdvanceBookingDays", "minNoticeMinutes", "name", "notifyByEmail", "notifyBySms", "notifyByWhatsapp", "phone", "reminder2HoursBefore", "reminderHoursBefore", "remindersEnabled", "requireCardToBook", "slotGranularityMinutes", "slug", "taxId", "taxPercent", "timezone", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
