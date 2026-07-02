# AppCitas

Plataforma **genérica y multi-negocio** de agendación de citas. Los clientes
reservan online y cancelan dentro del plazo de cada negocio; los dueños
gestionan agenda, citas, servicios, horarios, política de cancelación,
ingresos y estadísticas desde su panel.

Es un **proyecto base multi-sector**: el núcleo no asume ningún tipo de
negocio (peluquería, clínica, taller, consultoría…), de modo que puede
especializarse a cualquier sector sin refactorizar el dominio.

## Regla de negocio central

> Un cliente puede cancelar su cita gratis hasta **24 horas antes** (ventana
> configurable por negocio). Si cancela más tarde —o no se presenta— se le
> cobra el **porcentaje configurado** del precio del servicio (100% por
> defecto).

Implementada en `src/lib/domain/cancellation.ts` como función pura y cubierta
por tests. El importe cobrado queda registrado en la cita (`chargedCents`) y
alimenta las estadísticas de ingresos.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Estilos | Tailwind CSS 4 |
| Base de datos | SQLite en desarrollo · PostgreSQL en producción (Prisma 7 con driver adapters) |
| Autenticación | JWT firmado (jose) en cookie httpOnly + bcryptjs |
| Validación | Zod en todos los endpoints |
| Gráficas | Recharts |
| Tests | Vitest |

## Puesta en marcha

```bash
npm install                 # instala y genera el cliente Prisma (postinstall)
cp .env.example .env        # DATABASE_URL ya apunta a SQLite local
npx prisma migrate dev      # crea la base de datos
npm run db:seed             # datos demo (2 negocios, usuarios, ~1600 citas)
npm run dev                 # http://localhost:3000
```

Credenciales demo:

| Rol | Email | Contraseña |
|---|---|---|
| Dueño (Estudio Aurora) | `admin@demo.com` | `admin1234` |
| Dueño (Barbería Norte) | `barberia@demo.com` | `admin1234` |
| Cliente | `cliente@demo.com` | `cliente1234` |

Otros comandos: `npm test` (tests de dominio), `npm run build && npm start`
(producción; requiere `AUTH_SECRET` en el entorno), `npm run db:reset`.

## Arquitectura

```
src/
├── app/                        # rutas (App Router)
│   ├── page.tsx                # landing con negocios
│   ├── b/[slug]/               # página pública del negocio + wizard de reserva
│   ├── mis-citas/              # citas del cliente (cancelación con política)
│   ├── login, register, register-business
│   ├── admin/                  # panel del negocio (guard por rol)
│   │   ├── page.tsx            # dashboard: KPIs + gráficas
│   │   ├── agenda/             # agenda diaria con acciones
│   │   ├── citas/              # listado filtrable + paginado
│   │   ├── servicios/          # CRUD de servicios
│   │   ├── horario/            # horario semanal + cierres/festivos
│   │   └── ajustes/            # datos y política de cancelación
│   └── api/                    # REST (route handlers + zod)
│       ├── auth/               # login, logout, registro cliente y negocio
│       ├── businesses/[slug]/availability
│       ├── appointments/       # crear, listar, cancelar
│       └── admin/              # citas, estados, servicios, horario, ajustes
├── lib/
│   ├── domain/                 # ★ capa de dominio (independiente de la UI)
│   │   ├── availability.ts     # motor de huecos (función pura, testeada)
│   │   ├── cancellation.ts     # política de cancelación (pura, testeada)
│   │   ├── appointments.ts     # reservar/cancelar/estados (transaccional)
│   │   ├── stats.ts            # agregados del dashboard
│   │   └── dates.ts            # zona horaria del negocio ↔ UTC
│   ├── auth/                   # sesión JWT, hash, guards por rol
│   ├── prisma.ts               # singleton con driver adapter
│   └── money.ts                # importes en céntimos (enteros)
└── components/                 # UI (cliente y admin)
prisma/
├── schema.prisma               # modelo multi-tenant
└── seed.ts                     # dataset demo determinista
```

### Modelo de datos

`Business` (tenant) ← `User` (roles CLIENT / OWNER / STAFF / SUPER_ADMIN),
`Service`, `BusinessHour` (tramos semanales), `Closure` (festivos),
`Appointment` (estados `CONFIRMED / COMPLETED / CANCELLED / CANCELLED_LATE /
NO_SHOW`, precio congelado al reservar, importe cobrado).

Cada negocio configura su propia política: ventana de cancelación, % de cargo,
granularidad de huecos, antelación mínima y máxima.

### Decisiones de escalabilidad

- **Dominio desacoplado**: las reglas viven en `src/lib/domain`, sin
  dependencias de la UI. Se pueden extraer a un servicio propio o reutilizar
  desde una app móvil sin tocarlas. La API REST ya expone todos los flujos.
- **Sesión stateless (JWT)**: sin estado de sesión en servidor; escala
  horizontalmente sin Redis ni sticky sessions.
- **Dinero en céntimos (enteros)**: sin errores de coma flotante, portable
  entre motores de BD.
- **UTC en persistencia, zona horaria por negocio en presentación**: negocios
  en distintas zonas conviven en la misma instancia.
- **Anti doble-reserva**: el hueco se valida contra la oferta real y se
  re-comprueba dentro de una transacción justo antes de insertar (cierra la
  carrera entre dos clientes que pulsan a la vez).
- **Índices** en las consultas calientes (`businessId+startAt`,
  `clientId+startAt`, `businessId+status+startAt`) y paginación en listados.
- **SQLite → PostgreSQL** sin cambiar código de dominio: Prisma 7 con driver
  adapters (cambiar provider del schema y adaptador en `src/lib/prisma.ts`,
  p. ej. `@prisma/adapter-pg`). Los agregados del dashboard se calculan sobre
  una única consulta acotada por índice; con volúmenes muy grandes se
  materializarían con `GROUP BY` nativo o tablas de resumen.

## Cómo especializar el proyecto base a un sector

El core es agnóstico; especializar es aditivo:

1. **Vocabulario**: `Business.category` es una etiqueta libre; los textos de
   UI están centralizados en los componentes (fácil de tematizar o traducir).
2. **Campos propios del sector** (nº de silla, box, matrícula del coche…):
   añadir columnas o un JSON de metadatos a `Service`/`Appointment`; el motor
   de huecos y la política de cancelación no cambian.
3. **Recursos por empleado/sala**: el modelo ya separa `BusinessHour` del
   negocio; añadir una entidad `Resource` con sus horas y un `resourceId` en
   `Appointment` extiende el motor de huecos sin reescribirlo (la consulta de
   solapamiento pasa a filtrar por recurso).
4. **Reglas de precio del sector** (recargos, bonos, packs): el precio se
   congela al reservar (`priceCents`), de modo que cualquier motor de precios
   puede enchufarse en `createAppointment` sin afectar al histórico.

## Roadmap sugerido

- Pagos reales (Stripe): guardar tarjeta al reservar y ejecutar el cargo de
  cancelación tardía automáticamente (hoy el cargo queda registrado y el
  cobro es responsabilidad del negocio).
- Notificaciones (email/SMS) de confirmación y recordatorio.
- Multi-empleado: agenda por profesional con horarios propios.
- Rate limiting en `/api/auth/*` y auditoría de accesos.
- Recuperación de contraseña y verificación de email.
- i18n completo (los textos están en español).

## Tests

```bash
npm test
```

22 tests cubren el motor de disponibilidad (horarios, tramos múltiples,
solapamientos, antelaciones, cierres, zona horaria) y la política de
cancelación (límite exacto de 24h, porcentajes, redondeos, ventanas
personalizadas).
