# Puesta al día — SQL y variables de entorno

Guía práctica para dejar **todo al día** cuando no has ido aplicando los
scripts SQL ni las variables de entorno a medida que se añadían funciones.
Está en lenguaje llano y con bloques para copiar y pegar.

> **Resumen en 30 segundos**
> - **En tu ordenador (desarrollo)**: no tienes que hacer nada. La base de
>   datos local (SQLite) se pone al día sola y ahora mismo está al día.
> - **En producción (Supabase/Postgres)**: solo hay **un** script que pegar
>   (`scripts/supabase-catchup.sql`) y **unas pocas variables** que rellenar.
>   El script es idempotente: puedes ejecutarlo aunque ya tuvieras parte hecha,
>   solo añade lo que falte.

---

## Paso 0 — ¿En qué caso estás?

Elige tu situación; luego ve a la Parte A (base de datos) y la Parte B
(variables). Solo aplica lo de tu caso.

| Caso | Base de datos | Qué tienes que hacer |
|------|---------------|----------------------|
| **A) Solo en local** (aún no has desplegado) | SQLite `dev.db` | Prácticamente nada: ya está al día. Salta a "Verificar". |
| **B) Supabase** (panel web, sin acceso al puerto 5432) | PostgreSQL | Pegar **1 script** en el SQL Editor + rellenar variables en tu hosting. |
| **C) Postgres con acceso directo** (Neon, Railway, VPS…) | PostgreSQL | `prisma migrate deploy` + variables. |

---

## Parte A — Base de datos (SQL)

### Caso A · Local (SQLite)

No hay nada que aplicar a mano: las migraciones viven en `prisma/migrations/`
y se aplican solas. Para **comprobarlo**:

```bash
npx prisma migrate status
# Debe decir: "Database schema is up to date!"
```

Si alguna vez dijera que faltan migraciones:

```bash
npx prisma migrate dev
```

### Caso B · Supabase (pegar en el SQL Editor)

Supabase no te deja (en muchas redes) conectar por el puerto 5432, así que las
migraciones se aplican **pegando SQL** en el *SQL Editor* del panel. Todo el
historial está resumido en **un solo script idempotente**.

1. **¿Es una base de datos nueva y vacía?** Pega y ejecuta primero el esquema
   base:
   ```
   scripts/supabase-bootstrap.sql
   ```
   (Si ya tenías el esquema creado en su día, **sáltate este paso**.)

2. **Ponlo todo al día de una sola pasada** — pega y ejecuta:
   ```
   scripts/supabase-catchup.sql
   ```
   Aplica **todas** las mejoras posteriores al esquema base (migraciones 2→18):
   rate limit, autocierre y 2º recordatorio, reseñas, suscripción SaaS,
   idempotencia de webhooks, consentimiento RGPD, índices, búsqueda por
   trigramas, lista de espera, forma de pago, Stripe Connect, **señal al
   reservar**, **descuento de última hora**, **modo privado del marketplace**,
   **notas de cliente (CRM)** y **campañas de marketing**.
   Es **idempotente**: usa `IF NOT EXISTS`, así que da igual cuánto tuvieras ya
   aplicado; solo añade lo que falte y no rompe nada si lo ejecutas dos veces.

   > **¿Ya lo pegaste antes?** Vuelve a pegarlo: al ser idempotente solo añade
   > las migraciones que te falten (las últimas: 14 señal, 15 última hora,
   > 16 marketplace privado, 17 notas CRM y 18 campañas) sin tocar el resto.

3. **(Opcional) Datos de demostración** — si quieres 2 negocios de ejemplo con
   citas para probar, pega después:
   ```
   scripts/supabase-seed.sql
   ```

> Regla mental: **bootstrap** una vez (BD vacía) → **catchup** siempre que
> quieras ponerte al día → **seed** solo si quieres datos de ejemplo.

### Caso C · Postgres con acceso directo (Neon / Railway / VPS)

Con conexión directa al puerto 5432 no hace falta pegar SQL a mano; deja que
Prisma aplique lo pendiente:

```bash
DATABASE_URL="postgresql://…conexión directa (5432)…" npx prisma migrate deploy
```

Aplica solo lo que falte y registra cada migración. (En el despliegue con
Docker Compose esto ocurre solo al arrancar el contenedor.)

---

## Parte B — Variables de entorno

En **local** ya tienes las 4 imprescindibles en `.env` y el resto funciona en
"modo simulado" (los pagos no cobran, las notificaciones se encolan pero no
salen, las páginas legales muestran `[pendiente]`). Eso está bien para
desarrollar. Las variables importan cuando **despliegas** y quieres que las
cosas ocurran de verdad.

La lista completa y comentada está en **`.env.example`**. Aquí va agrupada por
prioridad para que sepas qué es imprescindible y qué es opcional.

### B.1 · Imprescindibles (siempre)

| Variable | Para qué | Cómo obtenerla |
|----------|----------|----------------|
| `DATABASE_URL` | La conexión a la base de datos | La cadena `postgresql://…` de Supabase/Neon (en Vercel usa el *Transaction pooler*, puerto 6543, con `?pgbouncer=true`) |
| `AUTH_SECRET` | Firma las sesiones (JWT) | `openssl rand -base64 32` |
| `CRON_SECRET` | Protege el disparador de notificaciones | `openssl rand -base64 32` |
| `APP_BASE_URL` | Construye los enlaces de emails y recordatorios | Tu URL pública final (p. ej. `https://citas.tudominio.com`) |

### B.2 · Recomendadas en producción (Postgres / serverless)

| Variable | Valor sugerido | Nota |
|----------|----------------|------|
| `PG_POOL_MAX` | `1` | Correcto en Vercel con el pooler de Supabase. Súbelo solo en VPS o con concurrencia in-function (ver DEPLOY.md). |
| `PG_CONNECT_TIMEOUT_MS` | `10000` | Evita que una petición se cuelgue si el pool está saturado. |
| `CSP_ENFORCE` | *(vacío)* | Déjalo vacío = la política de seguridad solo **reporta**, no bloquea. **No** lo pongas en `true` hasta validar en staging (Stripe.js es sensible a la CSP). |
| `ERROR_WEBHOOK_URL` | *(opcional)* | URL de Slack o propia para recibir un aviso por cada error, sin montar Sentry. |

### B.3 · Pagos con Stripe (para cobrar de verdad)

Sin estas, la pasarela va en **modo simulado**. Actívalas cuando quieras cobrar
no-shows (a los clientes del negocio) y/o la suscripción del negocio.

| Variable | Para qué |
|----------|----------|
| `STRIPE_SECRET_KEY` | Clave secreta de tu cuenta Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clave pública (se usa en el navegador) |
| `STRIPE_WEBHOOK_SECRET` | Del webhook a `https://TU-DOMINIO/api/payments/webhook` (eventos `payment_intent.succeeded`, `payment_intent.payment_failed` y `account.updated`) |
| `STRIPE_PRICE_PRO` | **Novedad SaaS**: id del precio recurrente del plan Pro que paga el negocio. Sin él, la suscripción B2B activa Pro sin cobrar. |
| `STRIPE_PLATFORM_FEE_PERCENT` | **Novedad Connect**: comisión (%) que te quedas de cada cobro B2C que va a la cuenta del negocio. `0` (por defecto) = el negocio recibe el importe íntegro. |

> **Stripe Connect (cobros que van a cada negocio)**: cada negocio conecta su
> cuenta desde el panel **`/admin/cobros`**. Requiere tener activado *Connect*
> en tu cuenta de Stripe y añadir el evento `account.updated` al webhook. Sin
> claves de Stripe, la conexión se **simula** para poder probar el flujo.

### B.4 · Notificaciones

| Grupo | Variables | Nota |
|-------|-----------|------|
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Cualquier proveedor (Brevo tiene capa gratuita). Recomendado para que salgan los recordatorios. |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Opcional. |
| WhatsApp (elige **una**) | `ULTRAMSG_INSTANCE_ID` + `ULTRAMSG_TOKEN` **o** `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` + `EVOLUTION_INSTANCE` | Opcional. UltraMsg es lo más rápido; Evolution es gratis autoalojado. |

### B.5 · Páginas legales (RGPD / LSSI-CE) — **novedad**

Rellenan los huecos de `/legal/aviso`, `/legal/privacidad` y `/legal/terminos`
**sin tocar código**. Lo que dejes vacío se muestra como `[pendiente]`.

`LEGAL_COMPANY_NAME`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `LEGAL_CITY`,
`LEGAL_CONTACT_EMAIL`, `LEGAL_CONTACT_PHONE`, `LEGAL_LAST_UPDATED`
y opcionales `LEGAL_REGISTRY`, `LEGAL_SMTP_PROVIDER`, `LEGAL_WHATSAPP_PROVIDER`,
`LEGAL_HOSTING`.

### B.6 · Solo si usas Docker Compose (opción B de DEPLOY.md)

`POSTGRES_PASSWORD` — contraseña del Postgres del contenedor.

### ¿Dónde se ponen?

- **Vercel**: *Settings → Environment Variables* (todas menos `POSTGRES_PASSWORD`).
- **VPS/Docker**: en el archivo `.env` (copia de `.env.example`).
- **GitHub Action de notificaciones**: además, en *Settings → Secrets and
  variables → Actions* del repo, añade `APP_BASE_URL` y `CRON_SECRET` (mismo
  valor que en el hosting) para que el cron cada 5 min funcione.

### Novedades desde que dejaste de seguirlo

Si montaste el entorno hace tiempo, estas son las variables **nuevas** que
probablemente no tengas puestas:

- `PG_POOL_MAX`, `PG_CONNECT_TIMEOUT_MS` — escalabilidad del pool.
- `STRIPE_PRICE_PRO` — cobro de la suscripción del negocio (capa SaaS).
- `STRIPE_PLATFORM_FEE_PERCENT` — tu comisión sobre los cobros de cada negocio (Stripe Connect).
- `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_CLOUD_PHONE_ID` — WhatsApp por la **API oficial de Meta** (recomendada; sustituye a UltraMsg/Evolution sin riesgo de baneo).
- `ERROR_WEBHOOK_URL`, `CSP_ENFORCE` — observabilidad y seguridad.
- Todo el grupo `LEGAL_*` — datos del titular para las páginas legales.

> **Sin variables nuevas obligatorias**: la señal, el descuento de última hora,
> el modo privado, el CRM y las campañas se activan desde el panel del negocio
> (Ajustes/Marketing), no con variables de entorno.

---

## Verificar que todo quedó al día

1. **Salud del servicio**: abre `https://TU-DOMINIO/api/health` → `{"ok":true}`.
2. **Migraciones (local o con acceso directo)**: `npx prisma migrate status` →
   "Database schema is up to date!".
3. **Supabase**: en el *Table Editor* deben verse las tablas nuevas
   `WaitlistEntry`, `Review`, `RateLimitCounter`, `ProcessedWebhookEvent`; en
   `Business`, las columnas `plan`, `subscriptionStatus`, `trialEndsAt`,
   `autoCompleteEnabled`, `reminder2HoursBefore`, `stripeAccountId`,
   `stripeChargesEnabled`; y en `Appointment`, la columna `paymentMethod`.
4. **Prueba de humo**: crea una reserva de prueba y comprueba en
   `/admin/notificaciones` que se encola el aviso. Con Stripe en modo test,
   haz una cancelación tardía con la tarjeta `4242 4242 4242 4242`.

---

## Chuleta rápida

```text
BASE DE DATOS
  Local ................ npx prisma migrate status   (ya al día)
  Supabase (vacía) ..... pega scripts/supabase-bootstrap.sql
  Supabase (al día) .... pega scripts/supabase-catchup.sql   ← el de una pasada
  Postgres directo ..... prisma migrate deploy

VARIABLES (mínimas para producción)
  openssl rand -base64 32   → AUTH_SECRET
  openssl rand -base64 32   → CRON_SECRET
  DATABASE_URL, APP_BASE_URL
  + Stripe / SMTP / LEGAL_* según lo que quieras activar
```

La lista completa y comentada vive en `.env.example`; el flujo de despliegue
está en `DEPLOY.md`.
