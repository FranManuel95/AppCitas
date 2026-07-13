# Integraciones externas — qué crear tú y qué construyo yo

Las funciones de este documento **no se pueden terminar solo con código**:
necesitan cuentas, aprobaciones o validaciones en paneles de terceros (Stripe,
Meta, Google, Play Store). Aquí está, para cada una: qué tienes que crear tú,
qué está ya preparado en el código, y qué faltaría construir después.

Ordenadas por prioridad según el análisis de competencia
(`ANALISIS-COMPETENCIA.md`).

---

## 1. Stripe real en staging (validar señal + Connect) — LA PRIMERA

**Qué desbloquea**: cobros reales de no-shows y señales, membresías de
clientes (cuota mensual del cliente al negocio, cobrada como suscripción de
plataforma con `transfer_data.destination` a la cuenta conectada del negocio)
y que el dinero llegue a la cuenta de cada negocio. Todo el código está hecho
y testeado en modo simulado; falta validarlo con Stripe de verdad antes de
activarlo en vivo.

**Tú (≈30 min, en modo test de Stripe):**
1. En [dashboard.stripe.com](https://dashboard.stripe.com) (modo **Test**):
   copia `STRIPE_SECRET_KEY` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` de prueba.
2. Crea un webhook a `https://TU-DOMINIO/api/payments/webhook` con los eventos
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `account.updated`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid` e `invoice.payment_failed` → copia `STRIPE_WEBHOOK_SECRET`.

   > **Membresías y suscripción Pro comparten eventos.** Los eventos de
   > suscripción pasan por un dispatcher compartido que enruta por
   > `metadata.kind`: `"membership"` → membresía de cliente; sin kind →
   > suscripción Pro del negocio. La deduplicación de webhooks es global por
   > eventId, así que da igual si apuntas los eventos a
   > `/api/payments/webhook` o a `/api/billing/webhook` (o a ambos): el
   > primero que procese cada evento lo aplica correctamente. No crees DOS
   > webhooks con secrets distintos para el mismo endpoint.
3. Activa **Connect** en el dashboard (Settings → Connect) con cuentas
   **Express**.
4. Pon las 3 variables en un despliegue de staging (o en producción con las
   claves de test) y haz Redeploy.

**Prueba de humo (con la tarjeta `4242 4242 4242 4242`):**
- Ajustes del negocio → activa "exigir tarjeta" y una señal del 20 % →
  reserva como cliente → verifica el cargo de la señal en el dashboard.
- Cancela en plazo → verifica el reembolso.
- Marca un no-show → verifica que solo se cobra la diferencia.
- `/admin/cobros` → conecta una cuenta Express de prueba → verifica que el
  estado pasa a "Activa" y que el siguiente cobro aparece en esa cuenta.

**Después**: cambiar a claves live. Sin cambios de código.

---

## 2. WhatsApp API oficial de Meta (Cloud API)

**Qué desbloquea**: recordatorios y campañas de WhatsApp sin riesgo de baneo.
El canal ya está implementado y tiene prioridad automática si configuras las
variables.

**Tú (≈1 h + verificación de Meta):**
1. Crea una app en [developers.facebook.com](https://developers.facebook.com)
   (tipo Business) y añade el producto **WhatsApp**.
2. Vincula (o crea) el **WhatsApp Business Account** y añade un número de
   teléfono dedicado (no puede estar en uso en la app normal de WhatsApp).
3. Copia el **phone_number_id** → variable `WHATSAPP_CLOUD_PHONE_ID`.
4. Genera un **token permanente** (System User en Business Settings → tokens
   con permiso `whatsapp_business_messaging`) → `WHATSAPP_CLOUD_TOKEN`.
5. Ponlas en Vercel y Redeploy. Listo: el canal oficial gana a UltraMsg/Evolution.

**Importante (regla de Meta)**: fuera de la "ventana de 24 h" desde el último
mensaje del cliente, los mensajes iniciados por el negocio necesitan
**plantillas aprobadas** por Meta. Crea en el panel de Meta plantillas para
"recordatorio de cita" y "hueco libre" (aprobación en horas/días).

**Yo, después**: ampliar el canal para enviar por plantilla (`sendViaCloudApi`
tiene señalado el punto de extensión) y el webhook de entrada para respuestas.

---

## 2b. Google Calendar (OAuth bidireccional)

**Qué desbloquea**: cada cita aparece como evento en el Google Calendar del
dueño o del empleado (saliente), y el "ocupado" personal de ese calendario
bloquea huecos de la agenda (entrante, freebusy en vivo con caché de 60 s y
fail-open). Todo el código está hecho; sin claves funciona en modo simulado
en desarrollo.

**Tú (≈20 min):**
1. En [console.cloud.google.com](https://console.cloud.google.com): crea un
   proyecto y activa la **Google Calendar API**.
2. Pantalla de consentimiento OAuth (tipo External) con los scopes
   `calendar.events`, `calendar.freebusy`, `openid` y `email`.
3. Credenciales → **ID de cliente OAuth** (aplicación web) con estas URIs de
   redirección autorizadas:
   - `https://TU-DOMINIO/api/admin/calendar/google/callback`
   - `https://TU-DOMINIO/api/staff/calendar/google/callback`
4. Variables en Vercel: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` +
   Redeploy.

**Prueba de humo**: Ajustes del negocio → "Conectar con Google" → autoriza →
reserva una cita → aparece como evento; crea un evento personal en ese
calendario → ese hueco deja de ofrecerse (tarda ≤60 s por la caché).

**Notas**: los tokens se guardan cifrados (AES-256-GCM con clave derivada de
`AUTH_SECRET`; rotar ese secreto obliga a reconectar con un clic). Mientras la
app de Google esté en modo "Testing", añade los emails de prueba como test
users; para uso público hace falta pasar la verificación de Google (proceso
estándar, unos días).

---

## 3. TWA — AppCitas en Google Play

**Qué desbloquea**: "tener app" en la Play Store con la web actual (misma
técnica que usa la competencia). **El manifest PWA y los iconos ya están en el
código** — la web ya es instalable desde el navegador ("Añadir a pantalla de
inicio") sin hacer nada más.

**Tú (≈2 h + revisión de Play):**
1. Cuenta de desarrollador de Google Play (pago único de 25 $) en
   [play.google.com/console](https://play.google.com/console).
2. En tu máquina, con Node instalado:
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://TU-DOMINIO/manifest.webmanifest
   bubblewrap build
   ```
   Esto genera el `.aab` para subir a Play Console.
3. Sube a Play Console el archivo `assetlinks.json` que te da Bubblewrap:
   debe servirse en `https://TU-DOMINIO/.well-known/assetlinks.json`
   (dímelo y lo añado al repo en un minuto).
4. Ficha de la app (capturas, descripción) y enviar a revisión.

---

## 4. Google Calendar (sincronización bidireccional)

**Qué desbloquea**: las citas aparecen en el calendario del dueño/empleado y
sus eventos personales bloquean huecos. Ninguno de los 3 competidores lo tiene.

**Tú (≈45 min):**
1. Proyecto en [console.cloud.google.com](https://console.cloud.google.com) →
   habilita **Google Calendar API**.
2. Pantalla de consentimiento OAuth (tipo Externo, scope
   `calendar.events`) — en "producción" para no caducar cada 7 días; Google
   puede pedir verificación de la marca.
3. Credencial **OAuth Client ID** (aplicación web) con redirect
   `https://TU-DOMINIO/api/integrations/google/callback` → me pasas
   `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (variables de entorno).

**Yo, después (es un grupo grande de código):** flujo OAuth por empleado,
guardado cifrado de tokens, push de citas al calendario, y lectura de
ocupado/libre para bloquear huecos. Cuando tengas las credenciales, lo
construyo con su grupo de tests.

---

## 5. Botón "Reservar" en Instagram e integración con Google

**Lo alcanzable HOY sin partnership (15 min, hazlo ya):**
- Instagram (cuenta de empresa) → Editar perfil → **añadir botón de acción /
  enlace**: apunta a `https://TU-DOMINIO/b/tu-negocio`. Cada negocio puede
  hacerlo con su propia página.
- Ficha de **Google Business Profile** → añade la URL de reservas en
  "Enlaces de citas". Aparece el botón azul "Reservar" en Google Maps/Búsqueda.
- El QR de `/admin/qr` sirve para bio, historias destacadas y el escaparate.

**Lo que requiere partnership (más adelante):**
- **Reserve with Google** (reserva nativa dentro de Google) exige ser partner
  aprobado del programa y una integración de inventario. Realista cuando haya
  volumen de negocios; el primer paso es el formulario de interés de Google.
- El **botón nativo de reservas de Instagram** funciona solo vía partners
  aprobados de Meta. Mientras tanto, el enlace del perfil cubre el 90 % del
  valor.

---

## 6. Asistente IA que reserva por WhatsApp

**Qué desbloquea**: el único diferenciador de TuAgenda, construido de verdad
(consultando disponibilidad real y cerrando la reserva).

**Requisito previo**: la integración nº 2 (Cloud API) funcionando, incluido el
**webhook de entrada** de Meta (URL de callback + verify token en su panel).
**Y una clave de LLM** (por ejemplo `ANTHROPIC_API_KEY`) como variable.

**Yo, después**: webhook de mensajes entrantes + agente conversacional que usa
las funciones de dominio existentes (disponibilidad, reservar, cancelar) con
confirmación explícita del cliente antes de tocar la agenda. Es el grupo más
grande; conviene hacerlo cuando la nº 2 esté en producción.

---

## 7. CSP en modo bloqueo (endurecer seguridad)

Ya emitimos la Content-Security-Policy en modo "solo reportar". Cuando el
staging del punto 1 esté funcionando **con Stripe.js cargando de verdad**:
revisa `/api/csp-report` (o el `ERROR_WEBHOOK_URL`) durante unos días y, si no
hay violaciones legítimas, pon `CSP_ENFORCE="true"` en Vercel y Redeploy.
Si algo se rompe, quitar la variable lo revierte al instante.

---

## Orden recomendado

1. **Stripe staging** (30 min) — desbloquea todo el dinero real.
2. **Instagram + Google Business por enlace** (15 min) — gratis e inmediato.
3. **WhatsApp Cloud API** (1 h + espera de Meta) — el canal estrella en España.
4. **TWA en Play** (2 h + revisión) — "tenemos app".
5. **CSP enforce** (5 min, tras validar el 1).
6. **Google Calendar** (45 min de paneles + un grupo de código mío).
7. **IA por WhatsApp** (tras el 3; el grupo de código más ambicioso).
