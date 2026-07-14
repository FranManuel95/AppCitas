-- Migración incremental 40: buffers por servicio (margen entre citas).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714110000_buffers_servicio', now(), 1)
ON CONFLICT DO NOTHING;
