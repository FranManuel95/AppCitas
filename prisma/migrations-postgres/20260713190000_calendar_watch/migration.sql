-- Watch channels de Google Calendar: push de cambios que invalida la caché
-- de freebusy al momento (sin canal, la caché de 60 s sigue funcionando).
ALTER TABLE "CalendarConnection" ADD COLUMN "watchChannelId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN "watchResourceId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN "watchExpiresAt" TIMESTAMP(3);
ALTER TABLE "CalendarConnection" ADD COLUMN "watchToken" TEXT;

-- CreateIndex
CREATE INDEX "CalendarConnection_watchChannelId_idx" ON "CalendarConnection"("watchChannelId");
