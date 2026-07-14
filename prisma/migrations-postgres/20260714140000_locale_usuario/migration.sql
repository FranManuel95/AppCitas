-- Idioma preferido del usuario: las notificaciones por defecto salen en él
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
