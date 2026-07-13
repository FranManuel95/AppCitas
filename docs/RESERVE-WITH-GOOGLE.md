# Reserve with Google (reservas desde el perfil de Google Maps/Búsqueda)

"Reserve with Google" añade un botón **RESERVAR** en la ficha de Google
(Maps y Búsqueda) de cada negocio, que crea la cita directamente en AppCitas.
Es un programa de partners de Google: el alta es un trámite (no código) y lo
hace el operador de la plataforma (tú), una sola vez para todos los negocios.

## Qué ya cumple AppCitas

- Página pública por negocio con **JSON-LD LocalBusiness** (nombre, dirección,
  teléfono, horario y rating agregado) — es la base de datos estructurados
  que Google usa para casar fichas.
- Motor de disponibilidad en tiempo real con API propia
  (`GET /api/businesses/{slug}/availability`) y creación de citas
  (`POST /api/appointments/guest`) — el feed/las llamadas del programa se
  construyen encima sin cambiar el dominio.
- Confirmaciones y recordatorios automáticos, cancelación con token
  (`/c/{token}`) y política de cancelación por negocio.

## Qué pide Google (trámite del operador)

1. Alta como partner en el **Actions Center** de Google
   ([actions.google.com/center](https://actions.center/)) — categoría
   "Appointments" (end-to-end booking).
2. Firmar el acuerdo de partner y pasar la revisión de marca/calidad.
3. Implementar, cuando te lo pidan, su integración técnica (dos opciones):
   - **Feeds**: subir a Google ficheros de comerciantes, servicios y
     disponibilidad (formato del Actions Center) con actualización periódica.
   - **API server**: exponer los endpoints de reserva del estándar de Google
     (BookingService: CheckAvailability, CreateBooking…), que se mapearían
     1:1 sobre el dominio existente (availability + createAppointment).
4. Verificar cada negocio contra su ficha de Google Business Profile
   (nombre + dirección deben coincidir — por eso importa rellenar la
   dirección en Ajustes).

## Realidad práctica

- El programa está **cerrado por regiones/categorías**: Google acepta
  partners por olas; el formulario del Actions Center es el primer paso y
  pueden tardar semanas en contestar.
- Mientras tanto, el mismo JSON-LD ya mejora el SEO local, y cualquier
  negocio puede poner su enlace de AppCitas (o su dominio propio) como
  "sitio web de reservas" en su Google Business Profile — un clic menos,
  sin programa de partners.
