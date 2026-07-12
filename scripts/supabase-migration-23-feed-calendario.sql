-- Migración incremental 23: feed iCal privado de la agenda (Google/Outlook).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "icsFeedToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Business_icsFeedToken_key" ON "Business"("icsFeedToken");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712140000_feed_calendario', now(), 1)
ON CONFLICT DO NOTHING;
