-- Migración incremental 12: forma de pago de la cita (efectivo / tarjeta).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260705120000_payment_method', now(), 1)
ON CONFLICT DO NOTHING;
