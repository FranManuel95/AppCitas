-- Avisar al equipo (empleado asignado, o al negocio si no lo hay) de nuevas
-- reservas y cancelaciones.
ALTER TABLE "Business" ADD COLUMN "notifyStaffEvents" BOOLEAN NOT NULL DEFAULT true;
