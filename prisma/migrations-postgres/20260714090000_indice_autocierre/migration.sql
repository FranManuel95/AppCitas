-- Índice para los barridos globales por estado + fin de cita: autocierre de
-- citas pasadas (CONFIRMED, endAt < corte) y win-back (COMPLETED por endAt).
-- Ambos recorren TODOS los negocios, sin businessId.

-- CreateIndex
CREATE INDEX "Appointment_status_endAt_idx" ON "Appointment"("status", "endAt");
