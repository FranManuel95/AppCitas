-- ⚠️ OBLIGATORIO ANTES DE ABRIR A CLIENTES REALES ⚠️
--
-- Elimina los datos de DEMOSTRACIÓN del seed (negocios "estudio-aurora" y
-- "barberia-norte" y todas las cuentas *@demo.com). Sus contraseñas son
-- PÚBLICAS (están en el repositorio): si estas cuentas existen en tu
-- producción, cualquiera puede entrar — incluida la de SUPER_ADMIN
-- (plataforma@demo.com / admin1234).
--
-- Pégalo en el SQL Editor de Supabase y ejecútalo. Es idempotente: si ya no
-- queda nada demo, no hace nada. Borra SOLO datos demo; no toca ningún
-- negocio ni usuario real.

-- 1) Negocios demo: el borrado cascada limpia servicios, horarios, equipo,
--    citas, notificaciones, cupones, bonos, campañas, etc.
DELETE FROM "Business" WHERE "slug" IN ('estudio-aurora', 'barberia-norte');

-- 2) Citas huérfanas de clientes demo en OTROS negocios (por si se usaron
--    las cuentas demo para reservar en un negocio real): se anonimiza el
--    cliente en vez de borrar la cita (histórico contable del negocio real).
--    (Appointment.clientId no tiene ON DELETE CASCADE a propósito.)
DELETE FROM "Notification" WHERE "appointmentId" IN (
  SELECT a."id" FROM "Appointment" a
  JOIN "User" u ON u."id" = a."clientId"
  WHERE u."email" LIKE '%@demo.com'
);
DELETE FROM "Review" WHERE "clientId" IN (
  SELECT "id" FROM "User" WHERE "email" LIKE '%@demo.com'
);
DELETE FROM "Appointment" WHERE "clientId" IN (
  SELECT "id" FROM "User" WHERE "email" LIKE '%@demo.com'
);

-- 3) Las cuentas demo en sí (dueños, empleada, clientes y el SUPER_ADMIN).
DELETE FROM "User" WHERE "email" LIKE '%@demo.com';

-- 4) Comprobación: ambas consultas deben devolver 0.
SELECT count(*) AS negocios_demo FROM "Business"
WHERE "slug" IN ('estudio-aurora', 'barberia-norte');
SELECT count(*) AS cuentas_demo FROM "User" WHERE "email" LIKE '%@demo.com';
