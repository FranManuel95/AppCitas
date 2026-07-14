-- Buffers por servicio: margen bloqueado antes/después de cada cita
ALTER TABLE "Service" ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0;
