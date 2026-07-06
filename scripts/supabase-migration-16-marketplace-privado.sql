-- Migración incremental 16: modo privado del marketplace.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "listedInMarketplace" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260706110000_marketplace_privacy', now(), 1)
ON CONFLICT DO NOTHING;
