-- Migración incremental 15: descuento de última hora.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "lastMinuteDiscountPercent" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260706100000_last_minute_discount', now(), 1)
ON CONFLICT DO NOTHING;
