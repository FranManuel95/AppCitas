-- Migración incremental 9: índices de camino caliente.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- 1) El cupo mensual del plan se cuenta por createdAt dentro de la transacción
--    de reserva; sin índice escanea el histórico completo del negocio.
-- 2) La limpieza del rate limiting borra por windowStart < corte; el PK
--    compuesto (key, windowStart) no cubre ese rango.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appointment_businessId_createdAt_idx" ON "Appointment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimitCounter_windowStart_idx" ON "RateLimitCounter"("windowStart");

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260704150000_hot_path_indexes', now(), 1)
ON CONFLICT DO NOTHING;
