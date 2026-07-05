# Guía del proyecto AppCitas

Una explicación completa y en lenguaje sencillo de **qué es AppCitas, qué hace y
cómo está hecho por dentro**. No hace falta ser programador para entender las
primeras secciones; las últimas entran en el detalle técnico.

---

## 1. ¿Qué es AppCitas en una frase?

**AppCitas es una plataforma de reservas de citas por internet para pequeños
negocios** (peluquerías, clínicas, estudios, consultas…). Cada negocio tiene su
propia página pública donde sus clientes reservan hora, y un panel privado para
gestionar su agenda, su equipo, sus precios y sus cobros.

Es lo que se llama un **SaaS multi-negocio** (o *multi-tenant*): una sola
aplicación da servicio a **muchos negocios a la vez**, cada uno con sus datos
aislados de los demás, y la plataforma les cobra una **suscripción mensual**.

No está atada a un sector concreto: sirve igual para una barbería que para una
fisioterapeuta, cambiando solo los textos.

---

## 2. Los cuatro tipos de usuario (roles)

Todo gira en torno a cuatro perfiles. Cada uno ve y puede hacer cosas distintas:

| Rol | Quién es | Qué hace |
|-----|----------|----------|
| **Cliente** (`CLIENT`) | La persona que reserva | Busca negocios, reserva, cancela, reprograma, valora, gestiona sus datos |
| **Dueño del negocio** (`OWNER`) | Quien contrata AppCitas | Administra su agenda, servicios, equipo, horarios, precios, cobros y su suscripción |
| **Empleado** (`STAFF`) | Profesional del negocio | Ve su propia agenda y marca el estado de sus citas, sin acceso a la administración |
| **Super-admin** (`SUPER_ADMIN`) | El operador de la plataforma | Ve todos los negocios, métricas globales (ingresos, altas), y puede suspender negocios |

---

## 3. Todo lo que puede hacer cada uno

### 3.1 El cliente

- **Descubrir negocios**: en la portada (`/`) hay un buscador por nombre,
  descripción o dirección, con filtro por categoría. Cada negocio tiene una
  ficha pública (`/b/nombre-del-negocio`) con sus servicios, horario, equipo,
  bonos y valoraciones.
- **Reservar** (`/b/nombre/reservar`): un asistente paso a paso —elige servicio,
  profesional (o "cualquiera"), día y hueco libre— que solo ofrece **huecos
  realmente disponibles**.
- **Pagar/guardar tarjeta**: si el negocio lo exige, el cliente guarda una
  tarjeta al reservar (para poder cobrarle una cancelación tardía o un no-show).
- **Usar promociones**: aplicar un **cupón** de descuento o gastar una sesión de
  un **bono** que haya comprado.
- **Gestionar sus citas** (`/mis-citas`): ver próximas e historial, **cancelar**
  (gratis dentro de plazo, con cargo si es tarde) y **reprogramar** a otro hueco.
- **Lista de espera**: si un día no hay hueco, apuntarse; si alguien cancela, el
  sistema le avisa para que reserve el hueco liberado.
- **Valorar**: dejar una reseña (1–5 estrellas + comentario) de una cita ya
  completada.
- **Confirmar asistencia**: desde el enlace del recordatorio (`/c/token`), sin
  necesidad de iniciar sesión.
- **Sus datos (RGPD)**: descargar todos sus datos en un fichero o **eliminar su
  cuenta** (se anonimiza) desde "Mis citas".

### 3.2 El dueño del negocio (panel `/admin`)

- **Dashboard**: KPIs del mes (ingresos, nº de citas, cancelaciones tardías,
  ocupación, clientes únicos) y gráficas de los últimos 12 meses.
- **Agenda y citas**: ver la agenda del día, listar citas (paginado) y marcar su
  estado: completada, no presentado, etc.
- **Servicios**: crear/editar/borrar servicios (nombre, duración, precio, color).
- **Equipo**: dar de alta empleados, asignarles servicios y horario propio, e
  **invitarles a su portal** por email.
- **Horario y cierres**: definir el horario semanal por tramos y días de cierre.
- **Promociones**: crear **cupones** de descuento y **bonos** (packs de sesiones).
- **Ajustes**: datos del negocio, política de cancelación (plazo y % de cargo),
  canales de notificación, exigir tarjeta al reservar, datos de facturación (IVA).
- **Lista de espera**: ver quién espera hueco, agrupado por día, con su contacto.
- **Notificaciones**: configurar recordatorios (email, SMS, WhatsApp).
- **Exportar**: descargar citas e ingresos en CSV, e imprimir recibos.
- **Plan y suscripción** (`/admin/plan`): ver su plan (Free/Pro), mejorar a Pro
  o gestionar la suscripción.

### 3.3 El empleado (portal `/personal`)

Una vista reducida: **su propia agenda** y poder marcar el estado de **sus**
citas. No accede a la administración del negocio ni a datos de otros empleados.

### 3.4 El super-admin (`/superadmin`)

- **Métricas de plataforma**: MRR estimado (ingreso recurrente mensual),
  negocios por estado, citas totales y del mes, y series de 6 meses de altas y
  de citas.
- **Gestión**: lista paginada de todos los negocios; **suspender/reactivar** un
  negocio (un negocio suspendido no puede operar su panel).

---

## 4. Cómo está hecho por dentro (la tecnología, en simple)

- **Next.js (React) + TypeScript**: es el marco que sirve tanto las páginas web
  como la API. Las páginas se generan en el servidor (rápidas y buenas para SEO).
- **Base de datos con Prisma**: Prisma es el "traductor" entre el código y la
  base de datos. En **desarrollo** se usa **SQLite** (un fichero local); en
  **producción**, **PostgreSQL** (por ejemplo, Supabase). El mismo código
  funciona con ambas.
- **Capa de dominio** (`src/lib/domain`): aquí vive **la lógica de negocio pura**
  (calcular huecos, aplicar la política de cancelación, límites del plan…),
  separada de las pantallas y de la API. Esto la hace fácil de probar.
- **Estilos con Tailwind CSS** y una pequeña librería de componentes propia
  (botones, tarjetas, etc.) con soporte de **tema claro y oscuro**.
- **Idiomas (i18n)**: la parte pública está en **español e inglés**.

En resumen, la estructura por capas es:

```
Páginas (lo que ve el usuario)  ─┐
API (endpoints /api/...)         ─┼─→  Dominio (reglas de negocio)  ─→  Prisma  ─→  Base de datos
Infraestructura (pagos, email…) ─┘
```

---

## 5. El modelo de datos (las "cajas" de información)

Estas son las entidades principales que guarda la base de datos, explicadas en
llano:

- **User (Usuario)**: cualquier persona con cuenta (cliente, dueño, empleado o
  super-admin). Guarda su email, contraseña cifrada, rol y consentimiento RGPD.
- **Business (Negocio)**: un negocio dado de alta. Contiene su configuración,
  política de cancelación, su plan de suscripción y su estado (activo/suspendido).
- **Service (Servicio)**: cada prestación que ofrece el negocio (corte, consulta…)
  con su duración y precio.
- **StaffMember (Empleado)** + **StaffHour** + **StaffService**: los profesionales
  del negocio, su horario propio y qué servicios realiza cada uno.
- **BusinessHour (Horario)** y **Closure (Cierre)**: el horario semanal del
  negocio y sus días cerrados.
- **Appointment (Cita)**: el corazón del sistema. Une cliente + servicio +
  (empleado) + fecha, con su estado (confirmada, completada, cancelada,
  cancelación tardía, no presentado) y el importe cobrado.
- **Coupon (Cupón)** y **Package/ClientPackage (Bono)**: promociones. El cupón es
  un descuento; el bono es un pack de sesiones que el cliente compra y va gastando.
- **Review (Reseña)**: valoración de una cita completada.
- **Notification (Notificación)**: la "bandeja de salida" de mensajes (confirmación,
  recordatorio, cancelación, no-show) que un proceso va enviando.
- **WaitlistEntry (Lista de espera)**: un cliente esperando hueco para un servicio
  en un día.
- **AuthToken**: tokens de un solo uso para verificar el email o restablecer la
  contraseña.
- **AuditLog (Auditoría)**: registro de accesos (logins, registros…) para seguridad.
- **RateLimitCounter**: contadores para limitar peticiones (antiabuso).
- **ProcessedWebhookEvent**: para no procesar dos veces el mismo aviso de Stripe.

---

## 6. Los flujos importantes, paso a paso

### 6.1 Reservar una cita

1. El cliente elige servicio, profesional y día.
2. El sistema calcula los **huecos libres** reales: cruza el horario del negocio
   (o del empleado), la duración del servicio, los días de cierre, la antelación
   mínima y las citas ya ocupadas.
3. Si no puso empleado, el sistema **asigna automáticamente** al profesional
   menos cargado de ese hueco.
4. Al confirmar, se crea la cita **dentro de una transacción con un "cerrojo"**
   (*advisory lock*) que impide que dos clientes reserven el mismo hueco a la vez
   (la temida doble reserva).
5. Se comprueba que el negocio no supera el **límite de citas de su plan**.
6. Se encolan una **confirmación inmediata** y un **recordatorio** programado.

### 6.2 Cancelar

- **Dentro de plazo** (p. ej. más de 24 h antes): gratis.
- **Fuera de plazo** (cancelación tardía): se aplica un **cargo** (un % del
  precio que fija el negocio) y, si el cliente guardó tarjeta, se **cobra
  automáticamente**.
- Al liberarse el hueco, se **avisa a la lista de espera** de ese día.

### 6.3 No presentado (no-show)

Cuando el negocio marca una cita como "no presentado", se aplica la misma
comisión que una cancelación tardía, se intenta cobrar con la tarjeta guardada, y
—novedad— **se avisa al cliente** por sus canales (antes se cobraba en silencio).

### 6.4 Lista de espera

1. Sin hueco, el cliente se apunta a un servicio para un día.
2. Si alguien cancela ese día, el sistema **avisa** a los que esperan.
3. Un proceso periódico (cron) **limpia** las entradas de días pasados y
   **recicla** los avisos no aprovechados para dar otra oportunidad.
4. Al reservar, la entrada de lista de espera del cliente se retira sola.

### 6.5 Suscripción del negocio (el SaaS)

- Al registrarse, el negocio arranca con **14 días de prueba** del plan **Pro**.
- Puede **mejorar a Pro** (pago con Stripe) o quedarse en **Free** (con límites:
  1 empleado y 50 citas/mes).
- Los **webhooks** de Stripe mantienen sincronizado el estado de la suscripción;
  son **idempotentes** (no se aplican dos veces) y **resistentes al desorden** de
  eventos.
- Si un pago falla o el negocio no se suscribe tras la prueba, se **degrada** a
  Free automáticamente.

---

## 7. Notificaciones

El sistema no envía los mensajes al instante, sino que los guarda en una **bandeja
de salida** (`Notification`) y un **proceso periódico** (`/api/jobs/notifications`,
pensado para un cron cada minuto) los despacha cuando toca. Ventajas: **reintentos
con espera** si un envío falla, y no se pierde nada aunque el proveedor esté caído.

Canales soportados: **email** (SMTP), **SMS** (Twilio) y **WhatsApp** (UltraMsg /
Evolution API). Cada negocio elige cuáles usa. Tipos de mensaje: confirmación de
reserva, recordatorio (con enlace para confirmar asistencia), cancelación, no-show
y aviso de hueco liberado (lista de espera).

---

## 8. Pagos

Hay **dos tipos de pago distintos**, que no hay que confundir:

- **B2C (cliente ↔ negocio)**: cobro de cancelaciones tardías y no-shows con la
  **tarjeta guardada** del cliente (Stripe *SetupIntent* para guardarla, y cobro
  automático). Existe un **proveedor simulado** para probar todo el flujo en local
  sin claves de Stripe.
- **B2B (negocio ↔ plataforma)**: la **suscripción mensual** que cada negocio paga
  a AppCitas (Stripe Checkout + portal de facturación). También tiene modo
  simulado en desarrollo (que **nunca** se activa en producción por seguridad).

---

## 9. Seguridad y privacidad

- **Aislamiento entre negocios**: cada consulta filtra por el negocio del usuario;
  un negocio nunca puede ver ni tocar datos de otro (probado con tests E2E).
- **Autenticación**: sesión con **JWT en cookie**, verificación de email,
  recuperación de contraseña y **revocación de sesiones** (un contador de versión
  invalida todas las sesiones si hace falta).
- **Antiabuso (rate limiting)**: límite de peticiones guardado en la base de datos
  (protege igual con varias réplicas). Por IP en endpoints anónimos y **por usuario**
  en los autenticados.
- **Cabeceras de seguridad**: `X-Frame-Options`, HSTS, `Referrer-Policy`, etc., y
  una **Content-Security-Policy con nonce por petición** en modo *report-only*
  (observa sin bloquear; se puede forzar con una variable de entorno tras validar).
- **RGPD**: consentimiento registrado al registrarse, **exportación** y **borrado
  (anonimizado)** de datos por autoservicio, y **purga automática** de datos de
  corta vida (logs de auditoría y webhooks a los 90 días).
- **Observabilidad**: log estructurado con un "gancho" para reenviar errores a un
  webhook o a Sentry. Ver `SECURITY.md` para el detalle.

---

## 10. Escalabilidad y rendimiento

- **Agregados en la base de datos**: los dashboards (negocio y plataforma) calculan
  sus métricas con *counts* en la BD, no trayendo miles de filas: escalan aunque
  haya cientos de miles de citas.
- **Caché de páginas públicas**: la portada y la ficha de cada negocio se sirven
  desde caché de datos (revalidación por tiempo), así los visitantes no golpean la
  BD en cada visita.
- **Índices** en los caminos calientes (cupo del plan, limpieza del rate limit) y
  **búsqueda con índices de trigramas** (pg_trgm) en PostgreSQL para que el buscador
  escale a miles de negocios.
- **Pool de conexiones** afinado para *serverless* (Vercel), con timeout finito.
- **Sitemap** con revalidación (ISR) para que los negocios nuevos aparezcan en SEO.

---

## 11. Calidad: pruebas y CI

- **Tests unitarios y de base de datos** con **Vitest**: cubren el dominio
  (disponibilidad, cancelación, planes, lista de espera, no-show, métricas…).
- **Tests de extremo a extremo (E2E)** con **Playwright**: recorren flujos reales
  en un navegador (reservar, cancelar, aislamiento, SaaS, lista de espera, no-show).
- **Integración continua (CI)** en GitHub Actions: en cada *push* corre los tests,
  aplica el esquema, construye la app y ejecuta los E2E. Nada se da por bueno sin
  estar en verde.

---

## 12. Puesta en marcha y despliegue (resumen)

- **En local**: SQLite, `npm run dev`, con datos de ejemplo (`db:seed`).
- **En producción**: PostgreSQL (Supabase recomendado), desplegable en **Vercel**
  o con **Docker**. Un **cron** invoca el job de notificaciones/mantenimiento.
- La configuración va por **variables de entorno** (ver `.env.example`): base de
  datos, secreto de sesión, claves de Stripe, proveedores de mensajería, etc.
- Guías detalladas: **`DEPLOY.md`** (despliegue, migraciones de Supabase paso a
  paso) y **`SECURITY.md`** (seguridad y observabilidad).

---

## 13. Mapa de archivos (dónde está cada cosa)

```
src/
  app/                 Páginas y API (rutas de Next.js)
    (páginas)          /, /b/[slug], /mis-citas, /admin/*, /personal, /superadmin…
    api/               Endpoints REST (/api/...)
  lib/
    domain/            Reglas de negocio (citas, disponibilidad, cancelación,
                       planes, lista de espera, reseñas, métricas de plataforma…)
    notifications/     Bandeja de salida y canales (email, SMS, WhatsApp)
    payments/          Cobros B2C (Stripe + proveedor simulado)
    billing/           Suscripción B2B del negocio (Stripe)
    auth/              Sesión, guards por rol, tokens
    i18n/              Diccionarios español/inglés
    (otros)            prisma, rate-limit, logger, csv, money, dates…
  components/          Componentes de interfaz reutilizables
  proxy.ts             Middleware: Content-Security-Policy con nonce
prisma/                Esquema de datos y migraciones
tests/e2e/             Pruebas de extremo a extremo (Playwright)
scripts/               Utilidades y migraciones SQL para Supabase
```

---

### En una frase

AppCitas es una **agenda de reservas como servicio** para muchos negocios a la
vez: los clientes reservan online, los negocios gestionan su día a día y cobran, y
la plataforma cobra una suscripción — todo con la reserva sin choques, los pagos,
las notificaciones, la privacidad y la escalabilidad ya resueltos.
