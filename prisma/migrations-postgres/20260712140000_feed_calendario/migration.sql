-- AlterTable
ALTER TABLE "Business" ADD COLUMN "icsFeedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_icsFeedToken_key" ON "Business"("icsFeedToken");
