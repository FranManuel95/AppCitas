-- Overrides opcionales de duración/precio por empleado y servicio. Solo se
-- aplican cuando la cita lleva ese empleado concreto.
ALTER TABLE "StaffService" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "StaffService" ADD COLUMN "priceCents" INTEGER;
