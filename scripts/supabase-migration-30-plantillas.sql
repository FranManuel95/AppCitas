-- Migración incremental 30: textos propios de los mensajes al cliente
-- (Business.notificationTemplates, JSON de overrides por plantilla).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "notificationTemplates" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713120000_plantillas_notificacion', now(), 1)
ON CONFLICT DO NOTHING;
