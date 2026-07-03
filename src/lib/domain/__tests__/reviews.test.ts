import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  MAX_REVIEW_COMMENT_LENGTH,
  assertReviewable,
  validateReviewInput,
} from "../reviews";

// Las partes de createReview que dependen de la base de datos (existencia de
// la cita → APPOINTMENT_NOT_FOUND 404, unicidad appointmentId → P2002 → 409 y
// getBusinessReviewSummary con aggregate) no se testean aquí: este suite cubre
// las reglas puras extraídas (validación de entrada y elegibilidad).

function captureDomainError(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error("se esperaba un DomainError y no se lanzó ninguno");
}

describe("validateReviewInput — rating", () => {
  it("acepta los límites válidos 1 y 5", () => {
    expect(validateReviewInput(1).rating).toBe(1);
    expect(validateReviewInput(5).rating).toBe(5);
  });

  it("rechaza 0 (por debajo del mínimo) con INVALID_RATING 422", () => {
    const err = captureDomainError(() => validateReviewInput(0));
    expect(err.code).toBe("INVALID_RATING");
    expect(err.httpStatus).toBe(422);
  });

  it("rechaza 6 (por encima del máximo)", () => {
    const err = captureDomainError(() => validateReviewInput(6));
    expect(err.code).toBe("INVALID_RATING");
  });

  it("rechaza valores no enteros (3.5) y no finitos (NaN)", () => {
    expect(captureDomainError(() => validateReviewInput(3.5)).code).toBe(
      "INVALID_RATING",
    );
    expect(captureDomainError(() => validateReviewInput(NaN)).code).toBe(
      "INVALID_RATING",
    );
  });
});

describe("validateReviewInput — comment", () => {
  it("recorta espacios y conserva el texto", () => {
    expect(validateReviewInput(4, "  Muy buen servicio  ").comment).toBe(
      "Muy buen servicio",
    );
  });

  it("comentario vacío, solo espacios, undefined o null → null", () => {
    expect(validateReviewInput(4, "").comment).toBeNull();
    expect(validateReviewInput(4, "   ").comment).toBeNull();
    expect(validateReviewInput(4).comment).toBeNull();
    expect(validateReviewInput(4, null).comment).toBeNull();
  });

  it("acepta exactamente 500 caracteres", () => {
    const comment = "a".repeat(MAX_REVIEW_COMMENT_LENGTH);
    expect(validateReviewInput(3, comment).comment).toBe(comment);
  });

  it("rechaza más de 500 caracteres (tras el trim) con 422", () => {
    const err = captureDomainError(() =>
      validateReviewInput(3, "a".repeat(MAX_REVIEW_COMMENT_LENGTH + 1)),
    );
    expect(err.code).toBe("COMMENT_TOO_LONG");
    expect(err.httpStatus).toBe(422);
  });

  it("los espacios exteriores no cuentan para el límite", () => {
    const padded = `  ${"a".repeat(MAX_REVIEW_COMMENT_LENGTH)}  `;
    expect(validateReviewInput(3, padded).comment).toBe(
      "a".repeat(MAX_REVIEW_COMMENT_LENGTH),
    );
  });
});

describe("assertReviewable — elegibilidad", () => {
  const base = { clientId: "client-1", status: "COMPLETED", hasReview: false };

  it("cita COMPLETED del propio cliente y sin reseña previa es valorable", () => {
    expect(() => assertReviewable(base, "client-1")).not.toThrow();
  });

  it("otro cliente no puede valorarla (FORBIDDEN 403)", () => {
    const err = captureDomainError(() => assertReviewable(base, "client-2"));
    expect(err.code).toBe("FORBIDDEN");
    expect(err.httpStatus).toBe(403);
  });

  it("solo las citas COMPLETED son valorables (REVIEW_NOT_ALLOWED 422)", () => {
    for (const status of ["CONFIRMED", "CANCELLED", "CANCELLED_LATE", "NO_SHOW"]) {
      const err = captureDomainError(() =>
        assertReviewable({ ...base, status }, "client-1"),
      );
      expect(err.code).toBe("REVIEW_NOT_ALLOWED");
      expect(err.httpStatus).toBe(422);
    }
  });

  it("una cita ya valorada no admite otra reseña (ALREADY_REVIEWED 409)", () => {
    const err = captureDomainError(() =>
      assertReviewable({ ...base, hasReview: true }, "client-1"),
    );
    expect(err.code).toBe("ALREADY_REVIEWED");
    expect(err.httpStatus).toBe(409);
  });

  it("la propiedad se comprueba antes que el estado: un tercero recibe 403 aunque la cita no esté completada", () => {
    const err = captureDomainError(() =>
      assertReviewable({ ...base, status: "CONFIRMED" }, "client-2"),
    );
    expect(err.code).toBe("FORBIDDEN");
  });
});
