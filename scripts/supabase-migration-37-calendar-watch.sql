-- Migración incremental 37: watch channels de Google Calendar.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "watchChannelId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "watchResourceId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "watchExpiresAt" TIMESTAMP(3);
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "watchToken" TEXT;

CREATE INDEX IF NOT EXISTS "CalendarConnection_watchChannelId_idx" ON "CalendarConnection"("watchChannelId");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713190000_calendar_watch', now(), 1)
ON CONFLICT DO NOTHING;
