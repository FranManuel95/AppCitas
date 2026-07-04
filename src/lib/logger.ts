// Logging estructurado mínimo (sin dependencias): emite una línea JSON por
// evento con contexto, para poder buscar/agregar en el recolector de logs del
// hosting (Vercel, Docker…). Es el punto único donde enganchar un servicio de
// captura de errores (Sentry) o alertas por webhook sin tocar los llamantes.

type Level = "info" | "warn" | "error";

type Context = Record<string, unknown>;

/** Capturador externo de errores (p. ej. Sentry). Ver setErrorSink. */
type ErrorSink = (event: string, error: unknown, context: Context) => void;

let customSink: ErrorSink | null = null;

/**
 * Registra un capturador externo al que se reenvía cada logError, para integrar
 * Sentry u otro servicio SIN añadir dependencias al núcleo. Llamar una vez al
 * arranque (p. ej. en instrumentation.ts). Pasar null lo desregistra.
 *
 *   setErrorSink((event, error, ctx) =>
 *     Sentry.captureException(error, { tags: { event }, extra: ctx }));
 */
export function setErrorSink(sink: ErrorSink | null): void {
  customSink = sink;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const code = (error as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    return out;
  }
  return { message: String(error) };
}

// Sink integrado sin dependencias: si ERROR_WEBHOOK_URL está definido, publica
// cada error como JSON a esa URL (webhook de Slack o endpoint propio). Es
// fire-and-forget: nunca relanza (evita bucles de log) ni bloquea la respuesta;
// en serverless puede perderse alguna alerta si la función se congela antes de
// completar el POST (mejor esfuerzo).
function webhookSink(event: string, error: unknown, context: Context): void {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const serialized = serializeError(error);
  const payload = {
    // `text` hace que un webhook de Slack lo renderice; el resto sirve a
    // endpoints genéricos que quieran el detalle estructurado.
    text: `[AppCitas] ${event}: ${serialized.message ?? "error"}`,
    event,
    error: serialized,
    context,
  };
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function emit(level: Level, event: string, context: Context, error?: unknown) {
  const payload: Record<string, unknown> = { level, event, ...context };

  if (error !== undefined) {
    if (error instanceof Error) {
      payload.error = { name: error.name, message: error.message };
      // El stack solo fuera de producción, para no inflar los logs ni filtrar
      // rutas internas en el recolector.
      if (process.env.NODE_ENV !== "production") {
        (payload.error as Record<string, unknown>).stack = error.stack;
      }
      const code = (error as { code?: unknown }).code;
      if (code !== undefined) (payload.error as Record<string, unknown>).code = code;
    } else {
      payload.error = { message: String(error) };
    }
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    // Reenvío a los sinks externos (nunca deben tumbar al llamante).
    try {
      customSink?.(event, error, context);
    } catch {
      // Un sink que falla no puede romper el flujo que estaba logueando.
    }
    webhookSink(event, error, context);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logError(event: string, error: unknown, context: Context = {}) {
  emit("error", event, context, error);
}

export function logWarn(event: string, context: Context = {}) {
  emit("warn", event, context);
}

export function logInfo(event: string, context: Context = {}) {
  emit("info", event, context);
}
