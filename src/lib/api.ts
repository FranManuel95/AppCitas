import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/lib/domain/errors";

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
      console.error("[api] error no controlado:", error);
      return NextResponse.json(
        { error: "Error interno", code: "INTERNAL" },
        { status: 500 },
      );
    }
  };
}
