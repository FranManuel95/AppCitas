-- Migración incremental 44: observabilidad del cron + índices de purga.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "lastJobRunAt" TIMESTAMP(3);
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "lastJobRunResult" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CalendarSyncJob_status_createdAt_idx" ON "CalendarSyncJob"("status", "createdAt");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260715090000_observabilidad_purga', now(), 1)
ON CONFLICT DO NOTHING;
