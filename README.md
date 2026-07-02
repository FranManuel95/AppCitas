# AppCitas

Plataforma **genérica y multi-negocio** de agendación de citas. Los clientes
reservan online y cancelan dentro del plazo de cada negocio; los dueños
gestionan agenda multi-empleado, citas, servicios, horarios, política de
cancelación, cobros, notificaciones, ingresos y estadísticas desde su panel.

Es un **proyecto base multi-sector**: el núcleo no asume ningún tipo de
negocio (peluquería, clínica, taller, consultoría…), de modo que puede
especializarse a cualquier sector sin refactorizar el dominio.

## Regla de negocio central

> Un cliente puede cancelar su cita gratis hasta **24 horas antes** (ventana
> configurable por negocio). Si cancela más tarde —o no se presenta— se le
> cobra el **porcentaje configurado** del precio del servicio (100% por
> defecto), automáticamente con su tarjeta guardada si el negocio usa Stripe.

Implementada en `src/lib/domain/cancellation.ts` como función pura y cubierta
por tests. El importe cobrado queda registrado en la cita (`chargedCents`) y
alimenta las estadísticas de ingresos.

## Funcionalidades

**Para clientes**: reserva en 3-4 pasos (servicio → profesional → fecha/hueco
→ confirmación), cancelación con aviso del cargo exacto antes de confirmar,
recordatorios con enlace de "¿vas a asistir?" de un toque, tarjeta guardada
solo si el negocio la exige.

**Para negocios**: dashboard con KPIs y gráficas, agenda diaria por empleado,
listado filtrable de citas, equipo con horarios propios y servicios asignados,
CRUD de servicios, horario semanal + festivos, log de notificaciones, política
de cancelación/recordatorios/pagos configurable, e invitación de empleados a
su propio portal.

**Para empleados (rol STAFF)**: portal propio en `/personal` con su agenda
diaria, datos de contacto del cliente y acciones de completar / no presentado
sobre sus citas (sin acceso al panel de administración). El dueño les invita
desde Equipo → "Dar acceso": reciben un email con un enlace de un solo uso
para establecer su contraseña.

**Cuentas**: verificación de email al registrarse (banner con reenvío hasta
confirmar), recuperación de contraseña por enlace de un solo uso con caducidad
(30 min) y rate limiting en todos los endpoints de autenticación (fuerza
bruta, enumeración y abuso de reenvíos).

**Integraciones** (todas opcionales; sin configurar, la app funciona y lo
simula/registra):

| Capacidad | Proveedor | Variables |
|---|---|---|
| Cobro automático de cancelación tardía / no-show | Stripe (SetupIntent + cargo off-session) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Email (confirmación, recordatorio, cancelación) | SMTP genérico — Brevo, Resend, Mailgun, Gmail… | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| SMS | Twilio (API REST, sin SDK) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp (sin API oficial de WhatsApp Business) | **UltraMsg** (hosted, QR en minutos) o **Evolution API** (autoalojado sobre Baileys, **gratis**: un Docker en cualquier VPS) | `ULTRAMSG_INSTANCE_ID`+`ULTRAMSG_TOKEN` **o** `EVOLUTION_API_URL`+`EVOLUTION_API_KEY`+`EVOLUTION_INSTANCE` |

Sobre WhatsApp y coste: la opción más barata es **Evolution API** (wrapper
REST de Baileys, 0 € de licencia, solo el VPS); UltraMsg es la más rápida de
montar. Ambas usan WhatsApp Web por detrás: usa un número dedicado del
negocio, no el personal. Si el volumen crece, el adaptador se cambia por la
API oficial sin tocar el resto del sistema (interfaz `Channel`).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Estilos | Tailwind CSS 4 |
| Base de datos | SQLite en desarrollo · PostgreSQL en producción (Prisma 7 con driver adapters) |
| Autenticación | JWT firmado (jose) en cookie httpOnly + bcryptjs |
| Pagos | Stripe (adaptador simulado sin claves) |
| Notificaciones | Outbox propio + nodemailer / Twilio / UltraMsg / Evolution API |
| Validación | Zod en todos los endpoints |
| Gráficas | Recharts |
| Tests | Vitest |

## Puesta en marcha

```bash
npm install                 # instala y genera el cliente Prisma (postinstall)
cp .env.example .env        # DATABASE_URL ya apunta a SQLite local
npx prisma migrate dev      # crea la base de datos
npm run db:seed             # datos demo (2 negocios, 5 empleados, ~3800 citas)
npm run dev                 # http://localhost:3000
npm run worker              # (otra terminal) despacha recordatorios cada 30s
```

Credenciales demo:

| Rol | Email | Contraseña |
|---|---|---|
| Dueño (Estudio Aurora, 3 empleados) | `admin@demo.com` | `admin1234` |
| Dueño (Barbería Norte, 2 empleados) | `barberia@demo.com` | `admin1234` |
| Empleada (portal /personal) | `ana@demo.com` | `staff1234` |
| Cliente | `cliente@demo.com` | `cliente1234` |

Otros comandos: `npm test`, `npm run build && npm start` (producción; requiere
`AUTH_SECRET`), `npm run db:reset`.

### Envío de notificaciones en producción

Los mensajes se persisten en un **outbox** (`Notification`) con su hora de
envío; un proceso los despacha con reintentos:

- **Servidor propio**: `npm run worker` (bucle cada 30 s), o
- **Serverless (Vercel u otros)**: un cron que llame cada minuto a
  `POST /api/jobs/notifications` con cabecera `Authorization: Bearer $CRON_SECRET`.

En desarrollo, los canales sin configurar "envían" al log del worker para
poder probar el flujo completo; en producción quedan marcados como omitidos.

### Recordatorio con confirmación de asistencia

El recordatorio (por defecto 26 h antes, configurable) incluye un enlace
`/c/<token>` único por cita: el cliente responde **"Sí, asistiré"** o
**"No podré asistir"** sin iniciar sesión. El "no" aplica la política de
cancelación mostrando el cargo exacto antes de confirmar. Se recomienda
programar el recordatorio *antes* de que venza la ventana gratuita para que
el cliente aún pueda cancelar sin coste (26 h > 24 h por defecto).

### Cobro automático (Stripe)

Si el negocio activa "exigir tarjeta para reservar", el wizard guarda la
tarjeta con un SetupIntent (Payment Element). Al producirse una cancelación
tardía o un no-show, el cargo se ejecuta **off-session** automáticamente;
si falla o no hay tarjeta, queda registrado como pendiente de cobro en
persona. El webhook (`/api/payments/webhook`) mantiene el estado sincronizado.
Sin claves de Stripe, una pasarela simulada permite recorrer todo el flujo en
desarrollo.

## Arquitectura

```
src/
├── app/
│   ├── page.tsx                # landing con negocios
│   ├── b/[slug]/               # página pública + wizard (servicio → profesional → hueco → tarjeta)
│   ├── mis-citas/              # citas del cliente (cancelación con política)
│   ├── c/[token]/              # confirmación de asistencia desde el recordatorio
│   ├── admin/                  # panel del negocio (guard por rol)
│   │   ├── page.tsx            # dashboard: KPIs + gráficas
│   │   ├── agenda/             # agenda diaria (empleado visible por color)
│   │   ├── citas/              # listado filtrable + paginado
│   │   ├── equipo/             # CRUD de empleados, horarios propios, servicios
│   │   ├── servicios/ horario/ notificaciones/ ajustes/
│   └── api/                    # REST (route handlers + zod)
│       ├── auth/ businesses/ appointments/ confirmations/
│       ├── payments/           # setup-intent + webhook Stripe
│       ├── jobs/notifications  # cron protegido (outbox)
│       └── admin/              # citas, estados, servicios, staff, horario, ajustes
├── lib/
│   ├── domain/                 # ★ capa de dominio (pura, testeada)
│   │   ├── availability.ts     # motor de huecos + multi-empleado + asignación
│   │   ├── cancellation.ts     # política de cancelación
│   │   ├── appointments.ts     # reservar/cancelar/estados (transaccional)
│   │   └── stats.ts dates.ts   # agregados y zona horaria
│   ├── payments/               # PaymentProvider: stripe | dev (simulado)
│   ├── notifications/          # outbox + canales EMAIL/SMS/WHATSAPP + plantillas
│   └── auth/ prisma.ts money.ts
├── components/                 # UI (cliente y admin)
scripts/worker.ts               # despachador local del outbox
prisma/schema.prisma seed.ts    # modelo multi-tenant + dataset demo
```

### Modelo de datos

`Business` (tenant) ← `User` (con `emailVerifiedAt` y vínculo opcional a su
ficha de empleado), `Service`, `BusinessHour`, `Closure`, `StaffMember`
(+`StaffHour` horario propio, +`StaffService` servicios que realiza),
`Appointment` (estado, precio congelado, cargo, empleado, token de
confirmación, estado de cobro), `Notification` (outbox programado) y
`AuthToken` (tokens de un solo uso — verificación, reset, invitación — solo
se persiste su hash SHA-256).

### Seguridad de cuentas

- **Verificación de email**: enlace de 24 h al registrarse; los enlaces de
  reset/invitación también verifican (llegar al email demuestra propiedad).
- **Recuperación de contraseña**: token de un solo uso (30 min), respuesta
  uniforme que no revela si la cuenta existe.
- **Rate limiting** (ventana deslizante en memoria; interfaz lista para
  Redis multi-instancia): login 10/15 min por IP+cuenta, registros 5/h,
  recuperación 3/15 min, reenvío de verificación 3/15 min.
- **Separación de privilegios**: el panel `/admin` es solo del dueño; el
  empleado opera únicamente sus citas vía `/api/staff/*`.

### Decisiones de escalabilidad

- **Dominio desacoplado y puro** (31 tests): reglas reutilizables desde una
  app móvil o un servicio aparte sin tocar la UI.
- **Multi-empleado sin romper compatibilidad**: sin equipo definido, el
  negocio funciona con agenda única; con equipo, cada empleado tiene su
  propia agenda (horario propio o heredado) y la asignación automática elige
  al menos cargado. Las citas antiguas sin empleado bloquean a todos
  (conservador, sin dobles reservas).
- **Outbox de notificaciones**: los envíos sobreviven a reinicios, se
  reintentan con backoff y son auditables desde el panel. Los proveedores son
  adaptadores de ~40 líneas: añadir Telegram o push es trivial.
- **Pagos con proveedor intercambiable**: la interfaz `PaymentProvider`
  aísla Stripe; el modo simulado permite CI y desarrollo sin claves.
- **Sesión stateless (JWT)**, **dinero en céntimos**, **UTC en persistencia**
  con zona horaria por negocio, **anti doble-reserva transaccional** (ahora
  por empleado), índices en consultas calientes y paginación.
- **SQLite → PostgreSQL** cambiando provider + adaptador (`@prisma/adapter-pg`).

## Cómo especializar el proyecto base a un sector

1. **Vocabulario**: `Business.category` es una etiqueta libre; textos de UI
   centralizados en componentes.
2. **Campos del sector**: columnas o JSON de metadatos en
   `Service`/`Appointment`; el motor de huecos no cambia.
3. **Recursos físicos** (salas, boxes, sillones): el patrón `StaffMember` ya
   modela agendas paralelas; duplicarlo para `Resource` es directo.
4. **Precios del sector**: el precio se congela al reservar; cualquier motor
   de precios se enchufa en `createAppointment` sin afectar al histórico.

## Roadmap sugerido

- Bonos/packs de sesiones y cupones.
- Auditoría de accesos y revocación de sesiones activas (versionado de JWT).
- Exportación de datos (CSV de citas/ingresos) y facturación.
- i18n completo (textos hoy en español).

## Tests

```bash
npm test
```

35 tests cubren el motor de disponibilidad (horarios, tramos, solapamientos,
antelaciones, cierres, zona horaria), la agenda multi-empleado (horario
propio/heredado, unión de huecos, asignación al menos cargado), la política
de cancelación (límite exacto, porcentajes, redondeos) y el rate limiter
(ventana deslizante, aislamiento por clave, tiempo de espera).
