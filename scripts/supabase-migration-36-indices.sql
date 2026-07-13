-- Migración incremental 36: índices de camino caliente (membresía y cupones).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

CREATE INDEX IF NOT EXISTS "Appointment_membershipId_startAt_idx" ON "Appointment"("membershipId", "startAt");
CREATE INDEX IF NOT EXISTS "Coupon_clientId_idx" ON "Coupon"("clientId");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260713180000_indices_membresia_cupon', now(), 1)
ON CONFLICT DO NOTHING;
