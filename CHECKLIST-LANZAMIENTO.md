# Checklist de lanzamiento — qué hacer y cuándo

Guía **accionable** de todo lo que queda pendiente del lado humano (nada es
código: el código está terminado y desplegado). Cada tarea dice **cuándo**
hacerla, **los pasos exactos** y **cómo verificar** que quedó bien.

Complementa a [`PENDIENTE.md`](./PENDIENTE.md) (el "qué" y el "por qué"); este
documento es el "cómo, paso a paso". Ve marcando las casillas.

> **Regla de oro del despliegue**: primero el SQL en Supabase, después el
> deploy. Y cualquier script `scripts/supabase-*.sql` es idempotente: repetirlo
> no rompe nada.

---

## Momento 1 · AHORA — antes de tener ningún cliente real

Estas 4 tareas son bloqueantes. Media hora en total.

### ☐ 1.1 Borrar las cuentas demo de producción 🔴 URGENTE

**Por qué**: el seed creó `admin@demo.com`, `barberia@demo.com`,
`cliente@demo.com`, `ana@demo.com` y `plataforma@demo.com` (¡super-admin!)
con la contraseña **pública** `admin1234`, que está en el repositorio.
Cualquiera puede entrar.

**Pasos**:
1. Entra en [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**.
2. Abre `scripts/remove-demo-accounts.sql` del repo, copia TODO su contenido,
   pégalo y pulsa **Run**. Es idempotente (re-ejecutarlo no falla).

**Verificar**: el propio script termina con consultas de verificación — deben
devolver **0 filas**. Además, intenta entrar en la web con
`plataforma@demo.com` / `admin1234`: debe fallar.

### ☐ 1.2 Poner la base de datos al día (migraciones 2→44)

**Por qué**: las rondas W, X e Y añadieron 17 migraciones (27→43: códigos de
recuperación, facturas, cumpleaños, plantillas, sellos, membresías, Google
Calendar, multi-sede, galería/dominio, índices de camino caliente, watch
channels, nota interna, buffers, consentimiento/win-back, comisiones, sede
en lista de espera e idioma del usuario). Sin ellas, las funciones nuevas
fallarán al tocar tablas o columnas que no existen.

**Pasos**:
1. Supabase → **SQL Editor** → pega TODO `scripts/supabase-catchup.sql` → **Run**.
   (Una sola pasada aplica todo lo que falte, da igual dónde te quedaste.)

**Verificar**: en el **Table Editor** deben verse (entre otras) las tablas
`Invoice`, `LoyaltyProgram`, `MembershipPlan`, `ClientMembership`,
`CalendarConnection`, `Location` y `BusinessPhoto`. Después abre
`https://TU-DOMINIO/api/health` → `{"ok":true}` y entra en
`/admin/informes` y `/admin/facturas` (deben cargar sin error).

### ☐ 1.3 Rellenar los datos legales (obligatorio RGPD/LSSI-CE)

**Pasos**:
1. Vercel → tu proyecto → **Settings → Environment Variables** → añade:
   `LEGAL_COMPANY_NAME`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `LEGAL_CITY`,
   `LEGAL_CONTACT_EMAIL`, `LEGAL_CONTACT_PHONE`, `LEGAL_LAST_UPDATED`
   (opcionales: `LEGAL_REGISTRY`, `LEGAL_SMTP_PROVIDER`,
   `LEGAL_WHATSAPP_PROVIDER`, `LEGAL_HOSTING`).
2. **Redeploy** (Deployments → ⋯ → Redeploy) para que las lea.

**Verificar**: `/legal/aviso`, `/legal/privacidad` y `/legal/terminos` ya no
muestran ningún `[pendiente]`.

### ☐ 1.4 Comprobar el cron de notificaciones

**Por qué**: los recordatorios, el autocierre, las facturas pendientes, las
renovaciones simuladas y la sincronización de calendario los dispara
`/api/jobs/notifications`. En Vercel Hobby el cron propio solo corre 1
vez/día; el workflow de GitHub lo llama **cada 5 minutos**.

**Pasos**:
1. GitHub → repo → **Settings → Secrets and variables → Actions**: deben
   existir `APP_BASE_URL` y `CRON_SECRET` (mismos valores que en Vercel).
2. GitHub → **Actions** → workflow "dispatch-notifications": comprueba que las
   ejecuciones recientes están en verde.

**Verificar**: haz una reserva de prueba y mira `/admin/notificaciones`: el
aviso debe pasar de "pendiente" a "enviado" (o a "omitido: canal no
configurado" si aún no hay SMTP — eso se arregla en el Momento 2).

---

## Momento 2 · Para que los avisos lleguen de verdad

Sin esto la app funciona, pero los mensajes se quedan encolados. Hazlo antes
de que reserve el primer cliente real.

### ☐ 2.1 Email (SMTP) — el canal principal

**Pasos**:
1. Crea una cuenta en un proveedor SMTP (Brevo tiene capa gratuita; también
   vale Resend, Mailgun, etc.) y copia sus credenciales SMTP.
2. En Vercel añade: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM` (p. ej. `AppCitas <avisos@tudominio.com>`), y Redeploy.
3. Si usas dominio propio de envío: configura SPF/DKIM en el panel del
   proveedor (te da los registros DNS exactos).

**Verificar**: reserva de prueba con tu email → debe llegarte la confirmación
con el .ics adjunto. En `/admin/notificaciones` el estado es "enviado".

### ☐ 2.2 Push web (gratuito) — recomendado

**Pasos**:
1. En tu ordenador: `npx web-push generate-vapid-keys`.
2. En Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (= `mailto:tu@email.com`). Redeploy.

**Verificar**: en `/mis-citas` (como cliente) aparece el botón de activar
avisos; actívalo y comprueba que llega un push con la próxima notificación.

### ☐ 2.3 SMS y WhatsApp — opcionales

- SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
- WhatsApp oficial (recomendado): guía completa en
  `INTEGRACIONES-EXTERNAS.md` §2 (app de Meta, número dedicado,
  `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_CLOUD_PHONE_ID`, y plantillas aprobadas
  para mensajes fuera de la ventana de 24 h).

---

## Momento 3 · Para cobrar de verdad (Stripe)

Hasta entonces, los pagos van en **modo simulado** (perfecto para enseñar la
app). Guía detallada con prueba de humo en `INTEGRACIONES-EXTERNAS.md` §1.

### ☐ 3.1 Claves y webhook

1. [dashboard.stripe.com](https://dashboard.stripe.com) (empieza en modo
   **Test**): copia `STRIPE_SECRET_KEY` y
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → Vercel.
2. Developers → Webhooks → **Add endpoint** →
   `https://TU-DOMINIO/api/payments/webhook` con estos eventos (la lista
   completa importa: los de suscripción alimentan también las **membresías
   de clientes**):
   - `payment_intent.succeeded`, `payment_intent.payment_failed`
   - `account.updated`
   - `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`
3. Copia el signing secret → `STRIPE_WEBHOOK_SECRET` en Vercel. Redeploy.

### ☐ 3.2 Configuración del dashboard

- **Connect** (Settings → Connect): actívalo con cuentas **Express** — es lo
  que permite que el dinero de señales/no-shows/membresías vaya a la cuenta
  de cada negocio (cada uno se conecta desde `/admin/cobros`).
- **SEPA** (Settings → Payment methods): actívalo para que la suscripción Pro
  se pueda pagar por domiciliación (más barata que tarjeta).
- **Precio Pro**: crea un producto con precio recurrente mensual y copia su
  id (`price_…`) → `STRIPE_PRICE_PRO` en Vercel. Sin él, "mejorar a Pro"
  activa el plan sin cobrar.
- (Opcional) `STRIPE_PLATFORM_FEE_PERCENT` — tu comisión (%) sobre cada cobro
  que va a la cuenta del negocio. `0` = el negocio recibe todo.

### ☐ 3.3 Prueba de humo (modo test, tarjeta `4242 4242 4242 4242`)

1. Ajustes del negocio → exige tarjeta + señal del 20 % → reserva como
   cliente → el cargo de la señal aparece en Stripe.
2. Cancela en plazo → reembolso automático.
3. Marca un no-show → se cobra solo la diferencia y se emite la factura
   (si el negocio tiene la facturación activada en Ajustes con su NIF).
4. Hazte socio de una membresía → aparece la suscripción en Stripe con
   `kind: membership` en metadata.
5. Todo verde → cambia a claves **live** (sin cambios de código).

---

## Momento 4 · Para activar Google Calendar (bidireccional)

Sin claves funciona en modo simulado (solo en desarrollo). Guía en
`INTEGRACIONES-EXTERNAS.md` §2b.

### ☐ 4.1 Proyecto de Google (≈20 min)

1. [console.cloud.google.com](https://console.cloud.google.com) → proyecto
   nuevo → habilita **Google Calendar API**.
2. **OAuth consent screen** (External) con los scopes `calendar.events`,
   `calendar.freebusy`, `openid`, `email`. Mientras esté en modo *Testing*,
   añade como *test users* los emails que vayan a conectar.
3. **Credentials → OAuth client ID** (Web application) con estas dos
   redirect URIs:
   - `https://TU-DOMINIO/api/admin/calendar/google/callback`
   - `https://TU-DOMINIO/api/staff/calendar/google/callback`
4. Vercel: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Redeploy.

**Verificar**: Ajustes del negocio → "Conectar con Google" → autoriza →
reserva una cita → aparece como evento en ese Google Calendar. Crea un evento
personal en ese calendario → ese hueco deja de ofrecerse en ≤60 s.

> Para abrirlo a cualquier usuario (no solo test users) hay que pasar la
> **verificación de Google** del consent screen (trámite estándar, días).

### ☐ 4.2 Push instantáneo — opcional (≈5 min)

Verifica el dominio en
[Google Search Console](https://search.google.com/search-console) (registro
DNS o archivo HTML). Con eso, al conectar un calendario la app abre un *watch
channel*: los cambios en Google invalidan la caché por push y el hueco se
actualiza en segundos en vez de en ≤60 s. Sin este paso todo funciona igual
(es mejora, no requisito). Los canales se renuevan solos desde el cron.

**Verificar**: conecta un calendario, crea un evento en Google y comprueba
que el hueco desaparece de la reserva en segundos.

### ☐ 4.3 Aviso operativo

Si algún día rotas `AUTH_SECRET`, los tokens cifrados de calendario se
invalidan: cada conexión mostrará "Reconectar" (un clic). No es avería.

---

## Momento 5 · Cuando un negocio pida su dominio propio (plan Pro)

Detalle en `DEPLOY.md` → "Dominio propio por negocio (Pro)".

1. ☐ El negocio guarda su dominio en **Ajustes → Dominio propio**
   (p. ej. `reservas.suclinica.com`).
2. ☐ El negocio crea en su DNS un **CNAME** hacia el dominio de la app.
3. ☐ **Tú** añades ese dominio en Vercel → Settings → **Domains** (Vercel
   emite el certificado solo). Sin este paso el dominio no llega a la app.

**Verificar**: abrir `https://reservas.suclinica.com` muestra la página
pública del negocio; el flujo de reserva funciona con normalidad.

---

## Momento 6 · Trámites de captación (cuando haya volumen)

No bloquean nada; son apuestas de crecimiento con guía propia:

- ☐ **Reserve with Google** (botón RESERVAR en Google Maps/Búsqueda): alta de
  partner en el Actions Center. El código ya cumple los requisitos (JSON-LD,
  API de disponibilidad). Guía: `docs/RESERVE-WITH-GOOGLE.md`.
- ☐ **App en Google Play (TWA)**: cuenta de desarrollador (25 $ una vez) +
  Bubblewrap + editar `public/.well-known/assetlinks.json` con tu fingerprint
  real. Receta completa: `docs/TWA.md`.
- ☐ Mientras tanto: cada negocio puede poner su enlace de AppCitas (o su
  dominio propio) como "sitio de reservas" en su Google Business Profile.

---

## Momento 7 · Mantenimiento periódico (rutina)

| Frecuencia | Qué | Dónde |
|---|---|---|
| Semanal | Revisar avisos fallidos u omitidos | `/admin/notificaciones` (o el panel de cada negocio) |
| Semanal | Workflow del cron en verde | GitHub → Actions → dispatch-notifications |
| Mensual | Backups activos | Supabase → Database → Backups (VPS: cron con `scripts/backup-pg.sh`) |
| Mensual | Errores del despliegue | Vercel → Logs (y `ERROR_WEBHOOK_URL` si lo configuraste) |
| Tras CADA nueva migración futura | Pegar el `supabase-migration-N-*.sql` nuevo (o el catch-up) ANTES del deploy | `PUESTA-AL-DIA.md` |
| Si rotas `AUTH_SECRET` | Todos cierran sesión y las conexiones de calendario piden reconectar | — |

---

## Resumen en una tabla

| Momento | Tarea | Referencia |
|---|---|---|
| **Ahora** | Borrar cuentas demo | `scripts/remove-demo-accounts.sql` |
| **Ahora** | Catch-up SQL 2→44 | `scripts/supabase-catchup.sql` |
| **Ahora** | Datos legales `LEGAL_*` | `PUESTA-AL-DIA.md` §B.5 |
| **Ahora** | Cron cada 5 min en verde | GitHub Actions |
| Primer cliente | SMTP + VAPID (push) | §2 de este documento |
| Cobros reales | Stripe: claves, webhook (8 eventos), Connect, SEPA, `STRIPE_PRICE_PRO` | `INTEGRACIONES-EXTERNAS.md` §1 |
| Calendario | `GOOGLE_CLIENT_ID/SECRET` + consent + redirect URIs | `INTEGRACIONES-EXTERNAS.md` §2b |
| WhatsApp oficial | App de Meta + plantillas | `INTEGRACIONES-EXTERNAS.md` §2 |
| Dominio propio | CNAME + añadir dominio en Vercel | `DEPLOY.md` |
| Crecimiento | Reserve with Google / TWA | `docs/RESERVE-WITH-GOOGLE.md` · `docs/TWA.md` |
| Siempre | Rutina de mantenimiento | §7 de este documento |
