-- Migración incremental 46: duración/precio por empleado (override StaffService).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "StaffService" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "StaffService" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260715110000_override_staff_service', now(), 1)
ON CONFLICT DO NOTHING;
