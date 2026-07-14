# Trabajo pendiente y hoja de ruta

Estado del proyecto a **julio de 2026**, tras las rondas de UX (U-1…U-5), de
producto (V-1…V-7), la ronda **W-1…W-12** que ejecutó prácticamente todo lo
que este documento listaba como pendiente, la ronda **X-1…X-5** de cierre
(cabos sueltos de integración, optimización de consultas/índices y watch
channels de Google Calendar) y la ronda **Y-1…Y-10** (multi-sede de cara al
cliente, purga del outbox y cota en solapamientos, reprogramar desde el
admin, nota interna por cita, vista de calendario semanal, tira multi-día en
el wizard, buffers por servicio, consentimiento de marketing con baja de un
clic + win-back, comisiones por empleado, lista de espera por sede y
notificaciones bilingües). Complementa a
[`ANALISIS-COMPETENCIA.md`](./ANALISIS-COMPETENCIA.md) (dónde estamos frente a
Booksy/Apúntalo/TuAgenda) y a [`PUESTA-AL-DIA.md`](./PUESTA-AL-DIA.md) (cómo
aplicar SQL y variables).

> **¿Buscas el paso a paso?** Todo lo pendiente del lado humano está en
> [`CHECKLIST-LANZAMIENTO.md`](./CHECKLIST-LANZAMIENTO.md), organizado por
> momento (qué hacer ahora, qué hacer al activar cada cosa) con pasos exactos
> y verificación. Este documento es el "qué y por qué"; aquel, el "cómo".

---

## 0. Contexto — lo que YA está hecho

- **Reservas y agenda**: wizard 3-5 pasos, multi-empleado con asignación
  automática, anti doble-reserva transaccional, reprogramación y cancelación
  con política de plazos, lista de espera con aviso automático (con precio
  rebajado si hay descuento de última hora), citas recurrentes (crear, cancelar
  y **mover la serie entera**), ausencias por empleado y **multi-sede** (la
  sede filtra el equipo; selector en el wizard, gestión en `/admin/sedes`).
- **Cobros**: señal/prepago, cargo automático de no-show, Stripe Connect,
  suscripción B2B free/pro con SEPA, y **facturas fiscales con numeración
  correlativa** (serie F/R, rectificativas, backfill, listado y CSV en
  `/admin/facturas`).
- **Fidelización completa**: bonos/packs, cupones, **tarjeta de sellos**
  (premio automático como cupón personal) y **membresías de clientes**
  (cuota mensual con descuento, Stripe en modo plataforma → cuenta del
  negocio, simulada en dev).
- **Notificaciones**: email HTML con .ics, SMS, WhatsApp (Cloud API +
  UltraMsg/Evolution), push web (PWA), outbox con reintentos, 2º recordatorio
  y **plantillas de texto editables por el negocio** (variables `{cliente}`,
  `{fecha}`…, en `/admin/notificaciones`).
- **CRM y marketing**: ficha de cliente, campañas con segmentos
  (nuevos/fieles/inactivos/**cumpleaños**), modo privado del marketplace,
  **importador CSV de clientes y servicios** (guía
  `docs/MIGRAR-DESDE-BOOKSY.md`) e **informes avanzados** (`/admin/informes`:
  cohortes de retención, ventas por servicio, rendimiento de promos, mapa de
  calor de ocupación, todo exportable a CSV).
- **Calendario**: feed iCal de salida por URL y **Google Calendar OAuth
  bidireccional** (citas → eventos; el "ocupado" personal bloquea huecos;
  env-gated con `GOOGLE_CLIENT_ID/SECRET`, simulado en dev) con **watch
  channels** (push de Google que invalida la caché de disponibilidad en
  segundos; requiere dominio verificado en Search Console, si no, caché de
  60 s como siempre).
- **Seguridad y RGPD**: 2FA (TOTP) **con códigos de recuperación**, paso de
  seguridad en el onboarding, auditoría, RGPD operativo, retención automática,
  script `scripts/remove-demo-accounts.sql` y `scripts/backup-pg.sh`.
- **Visual y captación**: color+logo por negocio, **galería de trabajos**,
  **JSON-LD LocalBusiness** (SEO local), **dominio propio por negocio (Pro)**,
  widget embebible, PWA instalable + guías `docs/TWA.md` y
  `docs/RESERVE-WITH-GOOGLE.md`.
- **Calidad**: 301 tests unitarios/BD + 30 E2E (reserva, cancelación, no-show,
  admin, aislamiento, SaaS, RGPD, lista de espera, móvil, invitado,
  **ausencias, series recurrentes, widget, 2FA, feed iCal, membresías,
  sellos, multi-sede e informes**).

---

## 1. Pendiente OPERATIVO / de configuración (antes de abrir a clientes reales)

No es código: son cosas que hay que **configurar o revisar** en producción.

| # | Tarea | Por qué | Dónde |
|---|---|---|---|
| 1 | 🔴 **Ejecutar `scripts/remove-demo-accounts.sql` en Supabase** | El seed crea `admin@demo.com`, `plataforma@demo.com`, etc. con la contraseña pública `admin1234`. El script (idempotente) ya existe: pégalo en el SQL Editor. | `scripts/remove-demo-accounts.sql` |
| 2 | 🔴 **Pegar el catch-up de migraciones (2→43)** | Las olas W, X e Y añadieron las migraciones 27…43 (facturas, sellos, membresías, calendario, sedes, galería/dominio, índices, watch channels, nota interna, buffers, consentimiento/win-back, comisiones, sede en lista de espera, idioma del usuario). `supabase-catchup.sql` es idempotente: una pasada lo deja todo al día. | `scripts/supabase-catchup.sql` |
| 3 | 🟡 **Claves VAPID para el push web** | Sin ellas, el canal de avisos gratis del navegador queda apagado. `npx web-push generate-vapid-keys` → 3 variables en Vercel. | `VAPID_*` |
| 4 | 🟡 **SMTP real** | Sin SMTP los emails se encolan pero no se envían (se ven en `/admin/notificaciones`). | `SMTP_*` |
| 5 | 🟡 **Datos legales** | Razón social, NIF, dirección… se muestran como `[pendiente]` en `/legal/*`. Obligatorio LSSI-CE/RGPD. | `LEGAL_*` |
| 6 | 🟡 **Stripe**: SEPA + `STRIPE_PRICE_PRO` + webhook con los eventos de suscripción | Los eventos nuevos (`customer.subscription.*`, `invoice.paid/…`) alimentan también las membresías de clientes (ver `INTEGRACIONES-EXTERNAS.md`). | Dashboard de Stripe |
| 7 | 🟡 **Google Calendar**: `GOOGLE_CLIENT_ID/SECRET` | Sin claves, la conexión funciona solo en modo simulado (dev). Guía paso a paso en `INTEGRACIONES-EXTERNAS.md` §2b. | Google Cloud Console |
| 8 | 🟢 **Backups** | Supabase/Neon: verificar que están activos. VPS: cron con `scripts/backup-pg.sh`. | `DEPLOY.md` |
| 9 | 🟢 **Disciplina de despliegue** | Primero el SQL en Supabase, luego el deploy. | `PUESTA-AL-DIA.md` |

---

## 2. Pendiente de PRODUCTO

Tras la ronda W queda poco, y todo es opcional o depende de terceros:

| Qué | Estado | Notas |
|---|---|---|
| **Asistente IA en WhatsApp** | ❌ Excluido a propósito de la ronda W (decisión de producto) | Las piezas duras ya existen (disponibilidad en tiempo real, anti doble-reserva, canal WhatsApp). Es una capa LLM que consulta y reserva por chat. |
| **Factura fiscal de las cuotas de membresía** | ⏸️ Diferida con diseño listo | Hoy solo se facturan cobros de cita; la cuota mensual de membresía la recibe el cliente como recibo de Stripe, sin factura F propia del negocio. Diseño acordado para cuando haya volumen: `Invoice.appointmentId` pasa a opcional + `membershipId` opcional + unique por (membresía, periodo) para idempotencia; emisión desde el webhook `invoice.paid` con `metadata.kind=membership` (importe autoritativo = Invoice de Stripe) y desde `renewSimulatedMemberships` en dev; concepto "Cuota membresía {plan} {mes}". Se difirió porque toca el modelo fiscal inmutable (~6 consumidores asumen la relación con cita) y el uso real de membresías aún es ~cero. |
| **Onboarding sin las features nuevas** | ✅ Decisión: no tocar | Los "primeros pasos" cubren el camino crítico (servicios, horario, cobros, equipo, seguridad); sedes/galería/informes/membresías se descubren desde el nav. Añadir pasos = fricción sin dato que lo justifique. |
| **Alta en Reserve with Google** | ⚠️ Trámite externo | El código ya cumple (JSON-LD, availability API). El proceso de partner está documentado en `docs/RESERVE-WITH-GOOGLE.md`. |
| **Publicar la TWA en Google Play** | ⚠️ Trámite externo | Receta completa en `docs/TWA.md` (Bubblewrap + `assetlinks.json` placeholder ya en el repo). |
| **Más idiomas** | ❌ Excluido (sin señal de mercado) | es/en completos. Añadir catalán/francés cuando lo pida el mercado. |
| **Webhooks push de Google Calendar (watch channels)** | ✅ Hecho (ronda X) | Push de Google → el webhook invalida la caché de disponibilidad en segundos; canales autorenovados desde el cron. Solo requiere verificar el dominio en Search Console (guía en `INTEGRACIONES-EXTERNAS.md` §2b); sin ello, caché de 60 s como antes. |
| **Reordenar la galería / más control visual** | 🟢 Menor | La galería ordena por posición de alta; falta drag&drop para reordenar. |

---

## 3. Deuda técnica y limitaciones conocidas

- **Invalidación de caché por tag pendiente.** La página pública cachea 60 s;
  la invalidación instantánea espera a que la API de caché de Next 16 se
  estabilice (`src/app/b/[slug]/page.tsx`).
- **Push web sin E2E real.** Cubierto por tests de API/BD
  (`webpush.db.test.ts`); un E2E de verdad necesita un push service externo —
  fuera de alcance, anotado.
- **Freebusy con ventana de caché.** Con watch channel activo (dominio
  verificado en Search Console) los cambios llegan por push en segundos y la
  caché vive 5 min; sin watch, la ventana es de 60 s. Un push perdido degrada
  al peor caso de 5 min — mismo carácter fail-open, aceptado y documentado.
- **Rotar `AUTH_SECRET` invalida los tokens cifrados de Google Calendar** —
  los usuarios reconectan con un clic (documentado en el código de
  `src/lib/crypto.ts`).
- **Cambiar de sede una cita = cancelar y reservar** (decisión del corte
  mínimo multi-sede; reprogramar conserva la sede).
- **Solo 2 planes** (free/pro) — decisión de producto, no carencia técnica.

---

## 4. Mapa: gaps del análisis de competencia → estado hoy

| Gap original | Estado hoy |
|---|---|
| 1. Prepago/señal al reservar | ✅ Hecho |
| 2. Campañas + segmentación | ✅ Hecho (incl. cumpleaños) |
| 3. WhatsApp API oficial (Cloud API) | ✅ Hecho |
| 4. Ficha CRM de cliente | ✅ Hecho (+ importador CSV) |
| 5. Asistente IA en WhatsApp | ❌ Excluido a propósito |
| 6. Reserva con Google + Instagram | ⚠️ Código listo; trámite de partner documentado |
| 7. App en tiendas (TWA) | ⚠️ Todo listo; falta el trámite de Play (docs/TWA.md) |
| 8. Google Calendar bidireccional | ✅ Hecho (OAuth, env-gated) |
| 9. Personalización visual + dominio propio | ✅ Hecho (galería + dominio Pro) |

---

## 5. Recomendación de orden

1. **Antes de captar clientes**: sección 1 completa — sobre todo #1 (cuentas
   demo), #2 (catch-up SQL) y los datos legales.
2. **Primeros clientes reales**: activa las claves externas según las
   necesites (VAPID, SMTP, Stripe, Google) — todo está env-gated y no bloquea.
3. **Escala**: asistente IA de WhatsApp y trámites de captación (Reserve with
   Google, TWA) cuando haya volumen.

> Nada bloquea el lanzamiento: el producto está completo para su caso de uso
> y lo que queda es configuración, trámites externos o apuestas de futuro.
