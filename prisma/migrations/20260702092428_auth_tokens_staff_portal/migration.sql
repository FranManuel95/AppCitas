-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StaffMember" ("active", "businessId", "color", "createdAt", "email", "id", "name", "phone", "updatedAt") SELECT "active", "businessId", "color", "createdAt", "email", "id", "name", "phone", "updatedAt" FROM "StaffMember";
DROP TABLE "StaffMember";
ALTER TABLE "new_StaffMember" RENAME TO "StaffMember";
CREATE UNIQUE INDEX "StaffMember_userId_key" ON "StaffMember"("userId");
CREATE INDEX "StaffMember_businessId_active_idx" ON "StaffMember"("businessId", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");
