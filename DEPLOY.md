# Guía de despliegue a producción

Dos rutas soportadas: **Vercel + Postgres gestionado** (la más rápida) o
**VPS con Docker Compose** (control total, WhatsApp gratis con Evolution API
en la misma máquina). En ambas, la app elige PostgreSQL automáticamente
cuando `DATABASE_URL` empieza por `postgres`.

---

## Checklist previa (común)

1. **Base de datos PostgreSQL**: Neon, Supabase, Railway o el contenedor del
   docker-compose. Guarda la cadena `postgresql://…`.
2. **Secretos**:
   ```bash
   openssl rand -base64 32   # AUTH_SECRET
   openssl rand -base64 32   # CRON_SECRET
   ```
3. **Stripe** (para cobro automático): crea la cuenta, copia
   `STRIPE_SECRET_KEY` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, y añade un
   webhook apuntando a `https://TU-DOMINIO/api/payments/webhook` con los
   eventos `payment_intent.succeeded` y `payment_intent.payment_failed`
   (te dará el `STRIPE_WEBHOOK_SECRET`).
4. **Email SMTP**: cualquier proveedor (Brevo tiene capa gratuita). Rellena
   `SMTP_HOST/PORT/USER/PASS/FROM`.
5. **SMS** (opcional): cuenta de Twilio → `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
6. **WhatsApp** (opcional, sin API oficial):
   - *Barato y rápido*: instancia de **UltraMsg**, escanea el QR con un
     número dedicado del negocio → `ULTRAMSG_INSTANCE_ID`, `ULTRAMSG_TOKEN`.
   - *Gratis (autoalojado)*: **Evolution API** en Docker
     (`docker run -p 8080:8080 atendai/evolution-api`), crea una instancia y
     escanea el QR → `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
     `EVOLUTION_INSTANCE`.
7. **Páginas legales**: sustituye los `[CORCHETES]` de
   `src/app/legal/*/page.tsx` con los datos reales del titular y revísalas
   con asesoría legal.
8. `APP_BASE_URL` = URL pública final (los enlaces de los recordatorios y
   emails se construyen con ella).

---

## Opción A — Vercel + Postgres gestionado

1. Importa el repositorio en Vercel (framework autodetectado: Next.js).
2. En *Settings → Environment Variables* añade **todas** las variables de la
   checklist (`DATABASE_URL` con la cadena de Neon/Supabase). El
   `postinstall` ejecuta `prisma generate` y, al ser `DATABASE_URL` de
   Postgres, genera el cliente correcto.
3. Aplica las migraciones desde tu máquina (una vez por cambio de schema):
   ```bash
   DATABASE_URL="postgresql://…" npx prisma migrate deploy
   DATABASE_URL="postgresql://…" npm run db:seed   # opcional: datos demo
   ```
4. **Cron de notificaciones**: el plan **Hobby (gratuito) de Vercel solo
   permite crons diarios**; un `schedule` más frecuente en `vercel.json`
   bloquea el despliegue con el aviso "Hobby accounts are limited to daily
   cron jobs". Por eso `vercel.json` trae un cron diario (red de seguridad)
   y el despacho real y frecuente lo hace un **GitHub Action** ya incluido
   (`.github/workflows/dispatch-notifications.yml`), que llama a
   `/api/jobs/notifications` cada 5 minutos (el mínimo que soporta el
   scheduler de GitHub) sin depender del plan de Vercel. Actívalo añadiendo
   en el repo, en *Settings → Secrets and variables → Actions*, dos secrets:
   `APP_BASE_URL` (tu URL de Vercel) y `CRON_SECRET` (el mismo valor que
   pusiste en las variables de entorno de Vercel). Si en algún momento pasas
   al plan Pro, puedes volver a poner `* * * * *` en `vercel.json` y
   desactivar el workflow.
5. Conecta tu dominio en *Settings → Domains* y actualiza `APP_BASE_URL`.
6. Verifica: `https://TU-DOMINIO/api/health` debe devolver `{"ok":true}`.

### Supabase como base de datos (recomendado si quieres panel visual)

Supabase es PostgreSQL gestionado: no requiere ningún cambio en el código.

1. Crea el proyecto en supabase.com y ve a *Settings → Database*.
2. Supabase ofrece varias cadenas de conexión; usa la adecuada:
   - **Vercel/serverless** → la del *Transaction pooler* (puerto 6543),
     añadiendo `?pgbouncer=true` al final (evita el error "prepared
     statement already exists" bajo conexiones agrupadas). Verificado con
     @prisma/adapter-pg contra Postgres real. Además, deja `PG_POOL_MAX=1`
     (valor por defecto): cada instancia serverless abre así una sola
     conexión al pooler; sin tope, muchas instancias concurrentes lo agotan.
     - **Importante con concurrencia in-function** (Vercel *Fluid Compute*,
       activo por defecto en proyectos nuevos): una misma instancia caliente
       atiende varias peticiones a la vez y comparten el pool. Con `PG_POOL_MAX=1`
       todas se serializan en una conexión y, si una transacción larga la
       retiene, las demás pueden agotar el `maxWait` de Prisma (P2028). Elige una
       de dos: (a) fija la concurrencia de las funciones a 1 y mantén
       `PG_POOL_MAX=1` (óptimo con el transaction pooler), o (b) sube
       `PG_POOL_MAX` al nivel de concurrencia esperado por instancia y dimensiona
       el pooler de Supabase acorde. `PG_CONNECT_TIMEOUT_MS` (10 s por defecto)
       hace que un `connect` encolado falle rápido en vez de colgar la petición.
   - **VPS/Docker (procesos persistentes)** → la del *Session pooler* o la
     conexión directa (puerto 5432).
   - **Migraciones y seed** (`prisma migrate deploy`, `db:seed`) → siempre la
     conexión **directa** (5432).
3. Ventaja añadida: el *Table Editor* de Supabase te deja inspeccionar citas,
   clientes e ingresos visualmente, y los backups vienen incluidos.
4. **Sin acceso directo al puerto 5432** (red corporativa, sandbox…): pega el
   contenido de `scripts/supabase-bootstrap.sql` en el **SQL Editor** del
   panel de Supabase y ejecútalo. Crea el esquema completo, activa RLS en
   todas las tablas (la API pública de Supabase no podrá leer tus datos; la
   app no se ve afectada) y deja el registro de migraciones coherente para
   futuros `prisma migrate deploy`. **Después**, ejecuta en orden los scripts
   incrementales `scripts/supabase-migration-2-*.sql` … `-8-*.sql` (cada uno
   añade las mejoras de una fase posterior: rate limit, autocierre/2º
   recordatorio, reseñas, suscripción SaaS, idempotencia de webhooks,
   consentimiento y el default de suscripción). Son idempotentes: registran su
   propia entrada en
   `_prisma_migrations`.
5. **Datos demo por el mismo camino** (opcional): pega después el contenido
   de `scripts/supabase-seed.sql` (2 negocios, equipo, ~140 citas, un bono
   y dos cupones — mismas credenciales que el seed local). Se regenera con
   `npx tsx scripts/generate-supabase-seed.ts`.

> ¿Y Airtable? No es apto como base de datos de esta app: sin transacciones
> no se puede garantizar el anti doble-reserva, y su límite de 5 peticiones/s
> no soporta tráfico real. Como PostgreSQL gestionado usa Supabase/Neon.

## Opción B — VPS con Docker Compose

1. Instala Docker + Docker Compose en el servidor.
2. Clona el repositorio y prepara el entorno:
   ```bash
   cp .env.example .env
   # Rellena: POSTGRES_PASSWORD, AUTH_SECRET, CRON_SECRET, APP_BASE_URL
   # y los proveedores que uses (Stripe, SMTP, Twilio, WhatsApp)
   ```
3. Arranca:
   ```bash
   docker compose up -d --build
   ```
   Esto levanta PostgreSQL, la app (puerto 3000, aplica las migraciones al
   arrancar) y el worker de notificaciones. `docker compose exec app npm run db:seed`
   si quieres datos demo.
4. Pon un proxy con TLS delante (Caddy es lo más simple):
   ```
   TU-DOMINIO {
     reverse_proxy localhost:3000
   }
   ```
5. Verifica `https://TU-DOMINIO/api/health` y que el worker corre:
   `docker compose logs -f worker`.

---

## Flujo de cambios de schema

El schema canónico es `prisma/schema.prisma` (SQLite, desarrollo). Tras
modificarlo:

```bash
npx prisma migrate dev --name mi_cambio     # migración de desarrollo
npm run db:sync-pg                          # regenera schema.postgres.prisma
DATABASE_URL="postgresql://…" npx prisma migrate dev --name mi_cambio
                                            # migración de producción (necesita
                                            # una BD Postgres accesible)
```

En despliegues, `prisma migrate deploy` aplica lo pendiente (el Dockerfile lo
hace al arrancar; en Vercel se ejecuta desde tu máquina o CI).

## Después del despliegue

- Cambia las contraseñas de las cuentas demo o ejecuta sin seed.
- Comprueba el envío real: crea una reserva y revisa `/admin/notificaciones`.
- Haz una cancelación tardía de prueba con una tarjeta de test de Stripe
  (`4242 4242 4242 4242`) antes de activar el modo live.
- Configura backups del Postgres (Neon/Supabase los incluyen; en VPS,
  `pg_dump` en un cron).
- Monitorización: apunta un uptime checker a `/api/health`.
