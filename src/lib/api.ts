import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";

// Extrae método y ruta de la petición (primer argumento de un route handler)
// para dar contexto al log, sin volcar cabeceras ni cuerpo (datos personales).
function requestContext(args: unknown[]): Record<string, unknown> {
  const req = args[0];
  if (req instanceof Request) {
    try {
      const url = new URL(req.url);
      return { method: req.method, path: url.pathname };
    } catch {
      return { method: req.method };
    }
  }
  return {};
}

// Envoltorio común de route handlers: errores de dominio y de validación se
// serializan de forma consistente ({ error, code }) sin filtrar internos.
export function apiHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse | Response>,
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof DomainError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.httpStatus },
        );
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Datos no válidos",
            code: "VALIDATION",
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          { status: 422 },
        );
      }
      logError("api.unhandled", error, requestContext(args));
      return NextResponse.json(
        { error: "Error interno", code: "INTERNAL" },
        { status: 500 },
      );
    }
  };
}
