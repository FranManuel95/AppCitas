-- Índices de camino caliente (ronda X):
-- 1) El tope mensual de la membresía se cuenta por membershipId + rango de
--    startAt DENTRO de la transacción de reserva (bajo el advisory lock);
--    sin índice escanea las citas del negocio en cada reserva con membresía.
-- 2) "Mis citas" lista los cupones personales del cliente en todos los
--    negocios; sin índice escanea la tabla completa de cupones.

-- CreateIndex
CREATE INDEX "Appointment_membershipId_startAt_idx" ON "Appointment"("membershipId", "startAt");

-- CreateIndex
CREATE INDEX "Coupon_clientId_idx" ON "Coupon"("clientId");
