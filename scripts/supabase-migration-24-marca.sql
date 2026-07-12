-- Migración incremental 24: marca por negocio (color y logo) para la página
-- pública y el widget embebible.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260712150000_marca_negocio', now(), 1)
ON CONFLICT DO NOTHING;
