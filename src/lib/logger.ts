// Logging estructurado mínimo (sin dependencias): emite una línea JSON por
// evento con contexto, para poder buscar/agregar en el recolector de logs del
// hosting (Vercel, Docker…). Es el punto único donde enganchar más adelante un
// servicio de captura de errores (Sentry) sin tocar los llamantes.

type Level = "info" | "warn" | "error";

type Context = Record<string, unknown>;

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
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
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
