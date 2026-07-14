-- Migración incremental 43: idioma preferido del usuario (notificaciones bilingües).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260714140000_locale_usuario', now(), 1)
ON CONFLICT DO NOTHING;
