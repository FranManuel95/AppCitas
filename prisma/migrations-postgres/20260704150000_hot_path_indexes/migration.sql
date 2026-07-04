-- Índices de camino caliente:
-- 1) El cupo mensual del plan se cuenta por createdAt dentro de la transacción
--    de reserva (bajo el advisory lock); sin índice escanea el histórico
--    completo del negocio en cada reserva.
-- 2) La limpieza del rate limiting borra por windowStart < corte; el PK
--    compuesto (key, windowStart) no cubre ese rango.

-- CreateIndex
CREATE INDEX "Appointment_businessId_createdAt_idx" ON "Appointment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitCounter_windowStart_idx" ON "RateLimitCounter"("windowStart");
