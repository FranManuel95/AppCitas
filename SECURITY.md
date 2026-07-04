# Seguridad y observabilidad

## Cabeceras de seguridad

Se aplican a todas las rutas desde `next.config.ts`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` (anti-clickjacking)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-DNS-Prefetch-Control: off`
- `poweredByHeader: false` (no se expone `X-Powered-By`)

### Content-Security-Policy

`src/proxy.ts` genera un **nonce por request** y emite una CSP. Next lee la
CSP de las cabeceras de la petición y añade el nonce a sus scripts, así que
`script-src` va estricto (`'nonce-…' 'strict-dynamic'`) sin allowlist de hosts.
`style-src` incluye `'unsafe-inline'` porque la app usa estilos en línea
(`style={{…}}`), que no admiten nonce. `frame-src`/`connect-src` abren lo justo
para **Stripe Elements** (`js.stripe.com`, `api.stripe.com`, `hooks.stripe.com`).

Por defecto va en **report-only**: no bloquea, solo reporta las violaciones a
`/api/csp-report`, que las loguea (y las reenvía al sink de errores). Es el paso
seguro para observar qué rompería antes de forzarla — importante porque Stripe.js
se carga en cliente y no se puede ejercitar en los tests de aquí. Para
**forzarla** (bloquear) pon `CSP_ENFORCE=true`; **valida antes en staging** con
el flujo de pago real.

## Captura de errores / alertas

El logger estructurado (`src/lib/logger.ts`) es el punto único de captura. Cada
`logError` se reenvía a dos sinks opcionales, además de la línea JSON en consola:

1. **Webhook** — si defines `ERROR_WEBHOOK_URL`, publica cada error como JSON a
   esa URL (webhook de Slack o endpoint propio). Sin dependencias, fire-and-forget.
2. **Sink personalizado** — para Sentry u otro SDK, registra un capturador una vez
   al arranque (por ejemplo en `instrumentation.ts`):

   ```ts
   import { setErrorSink } from "@/lib/logger";
   import * as Sentry from "@sentry/nextjs";
   setErrorSink((event, error, ctx) =>
     Sentry.captureException(error, { tags: { event }, extra: ctx }));
   ```

Los llamantes no cambian: siguen usando `logError(event, error, context)`.

## Postura ante `npm audit`

A fecha de este documento, `npm audit` reporta **6 vulnerabilidades moderadas**,
todas **transitivas** y **fuera del runtime de producción**:

- `@hono/node-server` — llega vía `@prisma/dev`, que cuelga de `prisma`, una
  **devDependency** (solo el servidor local `prisma dev`). No se despliega.
- `postcss` — herramienta de **build** (procesa nuestro propio CSS). Sin
  exposición en runtime.
- `next` — el aviso solo está corregido en versiones **canary/preview**
  (pre-release); `16.2.10` es la última **estable** y cae dentro del rango.

**No ejecutar `npm audit fix --force`:** su "arreglo" propone `next@9.3.3`, una
regresión de varias mayores que rompería la app. La acción correcta es esperar a
un parche **estable** de Next y actualizar entonces. Ninguna de las seis expone
la aplicación desplegada.
