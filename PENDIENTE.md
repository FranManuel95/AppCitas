# Trabajo pendiente y hoja de ruta

Estado del proyecto y análisis de lo que queda por hacer, a **julio de 2026**,
tras las rondas de UX (U-1…U-5) y de producto (V-1…V-7). Este documento se
apoya en una auditoría real del código; complementa a
[`ANALISIS-COMPETENCIA.md`](./ANALISIS-COMPETENCIA.md) (dónde estamos frente a
Booksy/Apúntalo/TuAgenda) y a [`PUESTA-AL-DIA.md`](./PUESTA-AL-DIA.md) (cómo
aplicar SQL y variables).

> **Cómo leer las prioridades**
> - 🔴 Alta · 🟡 Media · 🟢 Baja (impacto en negocio)
> - Esfuerzo: 🟢 pequeño (horas/1-2 días) · 🟡 mediano (varios días) · 🔴 grande (1+ semana o depende de terceros)

---

## 0. Contexto — lo que YA está hecho

Buena parte de lo que el análisis de competencia marcaba como pendiente ya se
construyó. Para no confundirlo con lo que falta:

- **Reservas y agenda**: wizard 3-4 pasos, multi-empleado con asignación
  automática, anti doble-reserva transaccional, reprogramación y cancelación
  con política de plazos, lista de espera con aviso automático al liberarse
  hueco.
- **Cobros**: señal/prepago al reservar, cargo automático de no-show con
  tarjeta guardada, Stripe Connect (el dinero va a la cuenta del negocio),
  suscripción B2B free/pro.
- **Fidelización parcial**: bonos/packs de sesiones y cupones de descuento.
- **Notificaciones**: email HTML con .ics, SMS, WhatsApp (Cloud API oficial +
  UltraMsg/Evolution), **push web (PWA)**, outbox con reintentos, 2º recordatorio.
- **CRM y marketing**: ficha de cliente con historial y notas, campañas
  masivas con segmentos (nuevos/fieles/inactivos), modo privado del marketplace.
- **Ronda reciente (U/V)**: primeros pasos guiados, panel usable en móvil,
  economía automática del super-admin, cita manual del negocio, **reserva sin
  registro (invitado)**, **ausencias por empleado**, **citas recurrentes**,
  **reprogramar desde el enlace del email**, **feed iCal de la agenda**
  (Google Calendar/Outlook), **widget embebible + marca por negocio** (color y
  logo), **2FA (TOTP)**, **RGPD operativo** (export/borrado/anonimización) y
  **SEPA** en la suscripción B2B.

---

## 1. Pendiente OPERATIVO / de configuración (antes de abrir a clientes reales)

No es código: son cosas que hay que **configurar o revisar** en producción.
Ordenadas por urgencia.

| # | Tarea | Por qué | Dónde |
|---|---|---|---|
| 1 | 🔴 **Quitar o blindar las cuentas demo** | El seed crea `admin@demo.com`, `plataforma@demo.com`, etc. con la contraseña pública `admin1234` (está en el repo). Si están en tu Supabase real, cualquiera entra como **super-admin**. Bórralas o cámbiales la contraseña antes de tener clientes. | `prisma/seed.ts` / Supabase |
| 2 | 🟡 **Claves VAPID para el push web** | Sin ellas, el canal de avisos gratis del navegador queda apagado (el botón ni aparece). `npx web-push generate-vapid-keys` → 3 variables en Vercel. | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| 3 | 🟡 **SMTP real** | Sin SMTP, las confirmaciones y recordatorios por email se encolan pero **no se envían** (se ven en `/admin/notificaciones`). | `SMTP_*` en `.env.example` |
| 4 | 🟡 **Rellenar los datos legales** | Razón social, NIF, dirección, etc. se muestran como `[pendiente]` en `/legal/*` hasta rellenarlos. Obligatorio LSSI-CE/RGPD. | `LEGAL_*` (ver `src/lib/legal.ts`) |
| 5 | 🟡 **Activar SEPA en Stripe** y fijar el precio Pro | El Checkout ya ofrece SEPA, pero hay que activarlo en Stripe (Settings → Payment methods). Sin `STRIPE_PRICE_PRO` la suscripción Pro se activa sin cobrar. | Dashboard de Stripe + `STRIPE_PRICE_PRO` |
| 6 | 🟢 **Copias de seguridad de la BD** | No hay script de backup en el repo. Supabase/Neon incluyen backups gestionados: **verifica que están activos** (o programa un `pg_dump` en cron si usas VPS). Documentarlo. | `DEPLOY.md` |
| 7 | 🟢 **Disciplina de despliegue** | Regla: **primero el SQL en Supabase, luego el deploy**. Ya está mitigado (el build no se cae si la BD no está lista), pero el orden sigue siendo el correcto. | `PUESTA-AL-DIA.md` |

---

## 2. Pendiente de PRODUCTO (funcionalidades por construir)

### 2.1 · Prioridad alta

| Qué | Estado actual | Esfuerzo | Notas |
|---|---|---|---|
| **Reserva con Google (Reserve with Google) + botón de reserva en Instagram** | No existe | 🔴 | Capta reservas donde el cliente ya busca ("peluquería cerca de mí") y donde el sector belleza se escaparata. El esfuerzo es el proceso de partner/aprobación de Google, no tanto el código. Ninguno de los 3 competidores lo tiene salvo Booksy. |
| **Factura B2B con IVA y numeración correlativa** | Solo recibo de cita imprimible (con IVA opcional), marcado como "roadmap" en el código. Las facturas de la suscripción las genera Stripe. | 🟡 | El recibo actual (`src/app/admin/recibo`) no es una factura fiscal. Falta serie/numeración correlativa propia. Stripe Invoicing cubre la parte B2B casi sin código. |
| **Códigos de recuperación del 2FA** | El 2FA (TOTP) funciona, pero **no hay códigos de backup**: si el dueño pierde el móvil, se queda fuera sin vía de recuperación. | 🟢 | Generar 8-10 códigos de un solo uso al activar el 2FA y aceptarlos en el login. Riesgo real de soporte si no se hace. |

### 2.2 · Prioridad media

| Qué | Estado actual | Esfuerzo | Notas |
|---|---|---|---|
| **Sincronización bidireccional con Google Calendar (OAuth)** | Solo feed iCal de **salida** de solo lectura (`/api/feeds/[token]`). No hay OAuth ni entrada (bloquear huecos por eventos personales del empleado). | 🔴 | Diferenciador: ninguno de los 3 competidores lo tiene. Requiere OAuth de Google + webhooks de sincronización. |
| **Informes avanzados** | Dashboard con KPIs básicos (ingresos, ocupación, top-5 servicios, estados, serie 12 meses). Falta retención/cohortes de clientes, rendimiento de cupones/promos, tendencias por servicio, comparativas. | 🟡 | El 90% del dato ya está en la BD; falta la capa de agregación y las vistas. |
| **Segmentación CRM ampliada** | 3 segmentos automáticos (nuevos/fieles/inactivos) + todos. Falta el de **cumpleaños** (no hay campo de fecha de nacimiento en `User`) y segmentos por gasto/servicio. | 🟡 | Añadir `birthDate` a `User` + segmento; habilita campañas de cumpleaños que Booksy vende. |
| **Fidelización real (sellos + membresías)** | Solo bonos/packs y cupones. No hay **tarjeta de sellos digital** ni **membresías/suscripciones recurrentes de clientes** (la única suscripción recurrente es la B2B del negocio). | 🔴 | Dos features distintas. Las membresías de cliente reutilizarían la infra de Stripe ya montada para B2B. |
| **Plantillas de notificación editables por el negocio** | Los tiempos y canales son configurables, pero el **texto** de los emails/recordatorios es fijo (`src/lib/notifications/templates.ts`). | 🟡 | Permitir editar el cuerpo con variables (`{cliente}`, `{fecha}`…). Requiere campo de plantilla en el esquema y sanitización. |
| **Asistente IA en WhatsApp** | No existe. Ya están las piezas duras (disponibilidad en tiempo real, anti doble-reserva, canal WhatsApp Cloud API). | 🔴 | Capa LLM que consulta disponibilidad y cierra la reserva por chat. Neutraliza el "asistente IA" de la competencia. |
| **Importador CSV de clientes/servicios** | No existe. | 🟡 | Habilita la migración asistida desde Booksy/otros — argumento de captación en el momento de máxima frustración del cliente rival. |

### 2.3 · Prioridad baja / victorias rápidas

| Qué | Estado actual | Esfuerzo | Notas |
|---|---|---|---|
| **Reprogramar/editar una serie recurrente entera** | Solo se puede cancelar el resto de la serie o reprogramar cita a cita. | 🟢 | Completa la función de series (V-3). |
| **Descuento de última hora conectado a la lista de espera** | Ambas piezas existen por separado (descuento last-minute + waitlist con aviso). | 🟢 | Avisar de huecos liberados con precio rebajado. Función que ningún competidor tiene, con dos piezas ya construidas. |
| **2FA opcional en el alta de negocio** | El 2FA se activa después, desde ajustes; no se ofrece en `register-business`. | 🟢 | Menor. |
| **App en tiendas vía TWA** | PWA instalable ya hecha. Falta empaquetar la TWA para Google Play. | 🟢 | Cierra la percepción "ellos tienen app y vosotros no". |
| **Personalización visual avanzada** | Color de marca + logo ya hechos (V-5). Falta galería de fotos de trabajos, orden de secciones y **dominio propio** como add-on de pago. | 🟡 | El dominio propio es monetizable en el plan Pro. |
| **Más idiomas** | es/en completos (incluido el panel admin). | 🟡 | Añadir p. ej. catalán/francés según mercado. |
| **Multi-sede / multi-sucursal** | No existe: un negocio = una dirección y una zona horaria. | 🔴 | Solo pesa frente a cadenas grandes; cambio de esquema importante. Baja prioridad salvo que se persiga ese segmento. |

---

## 3. Deuda técnica y limitaciones conocidas

- **Cobertura E2E incompleta.** Los tests unitarios y de BD (204 en total)
  cubren bien el dominio, y hay E2E del núcleo (reserva, cancelación, no-show,
  admin, aislamiento, SaaS, RGPD, lista de espera, móvil, invitado). **Faltan
  E2E** para las funciones nuevas: ausencias de empleado, series recurrentes,
  widget embebido, 2FA/TOTP, push web y feed iCal.
- **Backups no automatizados en el repo.** Solo documentados; la única purga
  automática es la de retención RGPD (`src/lib/domain/retention.ts`, logs y
  webhooks a 90 días).
- **Recibo ≠ factura fiscal.** `src/app/admin/recibo/[id]` es un recibo simple
  sin numeración correlativa (marcado como roadmap en el propio código).
- **Invalidación de caché por tag pendiente.** La página pública del negocio
  cachea a 60 s; la invalidación instantánea espera a que la API de caché de
  Next 16 se estabilice (`src/app/b/[slug]/page.tsx`).
- **Solo 2 planes** (free/pro), sin tramos intermedios — es una decisión de
  producto, no una carencia técnica.

---

## 4. Mapa rápido: gaps del análisis de competencia → estado hoy

Reconcilia la tabla "Huecos a cerrar" de `ANALISIS-COMPETENCIA.md` (escrita
antes de estas rondas) con lo construido:

| Gap original | Estado hoy |
|---|---|
| 1. Prepago/señal al reservar | ✅ Hecho |
| 2. Campañas + segmentación | ✅ Campañas y 3 segmentos · ⚠️ falta cumpleaños |
| 3. WhatsApp API oficial (Cloud API) | ✅ Hecho |
| 4. Ficha CRM de cliente | ✅ Hecho |
| 5. Asistente IA en WhatsApp | ❌ Pendiente (🔴) |
| 6. Reserva con Google + Instagram | ❌ Pendiente (🔴) |
| 7. App en tiendas (TWA) | ⚠️ PWA hecha, falta empaquetar TWA |
| 8. Google Calendar bidireccional | ⚠️ Solo feed de salida (V-7); falta OAuth/entrada |
| 9. Personalización visual + dominio propio | ⚠️ Color+logo hechos (V-5); falta galería y dominio |

---

## 5. Recomendación de orden

1. **Antes de captar clientes**: cerrar la sección 1 (operativo), sobre todo
   **quitar las cuentas demo** y los datos legales.
2. **Primeros clientes reales**: deja que sus quejas prioricen la sección 2.
   La apuesta más segura es **Reserve with Google** (captación) y los
   **códigos de recuperación del 2FA** (soporte), ambos de alto valor.
3. **Escala**: informes avanzados, membresías de cliente y el asistente IA
   cuando haya volumen que lo justifique.

> Nada de la sección 2 bloquea el lanzamiento. El producto está completo para
> su caso de uso principal; lo pendiente es crecimiento y pulido.
