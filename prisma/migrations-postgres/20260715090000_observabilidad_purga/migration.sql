-- Observabilidad del cron: la sonda /api/health lee la última ejecución para
-- que un monitor externo detecte que el cron dejó de dispararse.
ALTER TABLE "PlatformSetting" ADD COLUMN "lastJobRunAt" TIMESTAMP(3);
ALTER TABLE "PlatformSetting" ADD COLUMN "lastJobRunResult" TEXT;

-- Índices para la purga de retención (borra por createdAt < cutoff): evitan el
-- seq-scan cada 5 min sobre la conexión compartida (PG_POOL_MAX=1).
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "CalendarSyncJob_status_createdAt_idx" ON "CalendarSyncJob"("status", "createdAt");
