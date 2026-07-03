import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";

// Reseñas post-cita: un cliente puede valorar (1-5 estrellas + comentario
// opcional) cada cita COMPLETED suya, una sola vez. Las reglas puras
// (validación de entrada y elegibilidad) están extraídas para testearlas
// sin base de datos.

export const MAX_REVIEW_COMMENT_LENGTH = 500;

export interface ReviewInput {
  rating: number;
  comment: string | null;
}

/**
 * Valida y normaliza la entrada de una reseña. Pura: lanza DomainError si el
 * rating no es un entero 1..5 o el comentario (ya recortado) supera los 500
 * caracteres; devuelve el comentario recortado (o null si queda vacío).
 */
export function validateReviewInput(
  rating: number,
  comment?: string | null,
): ReviewInput {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new DomainError(
      "La valoración debe ser un número entero entre 1 y 5",
      "INVALID_RATING",
      422,
    );
  }
  const trimmed = comment?.trim() ?? "";
  if (trimmed.length > MAX_REVIEW_COMMENT_LENGTH) {
    throw new DomainError(
      `El comentario no puede superar los ${MAX_REVIEW_COMMENT_LENGTH} caracteres`,
      "COMMENT_TOO_LONG",
      422,
    );
  }
  return { rating, comment: trimmed || null };
}

/**
 * Regla pura de elegibilidad: solo el cliente de la cita puede valorarla, la
 * cita debe estar COMPLETED y no tener reseña previa. Lanza DomainError; si
 * no lanza, la cita es valorable por ese actor.
 */
export function assertReviewable(
  appointment: { clientId: string; status: string; hasReview: boolean },
  actorClientId: string,
): void {
  if (appointment.clientId !== actorClientId) {
    throw new DomainError(
      "No tienes permiso sobre esta cita",
      "FORBIDDEN",
      403,
    );
  }
  if (appointment.status !== "COMPLETED") {
    throw new DomainError(
      "Solo se pueden valorar citas completadas",
      "REVIEW_NOT_ALLOWED",
      422,
    );
  }
  if (appointment.hasReview) {
    throw new DomainError(
      "Esta cita ya tiene una valoración",
      "ALREADY_REVIEWED",
      409,
    );
  }
}

export async function createReview(params: {
  appointmentId: string;
  clientId: string;
  rating: number;
  comment?: string | null;
}) {
  const { appointmentId, clientId } = params;
  const input = validateReviewInput(params.rating, params.comment);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      businessId: true,
      clientId: true,
      status: true,
      review: { select: { id: true } },
    },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  assertReviewable(
    {
      clientId: appointment.clientId,
      status: appointment.status,
      hasReview: !!appointment.review,
    },
    clientId,
  );

  // appointmentId es @unique en Review: ante dos envíos simultáneos la BD
  // rechaza el segundo; lo traducimos al mismo 409 que la comprobación previa.
  try {
    return await prisma.review.create({
      data: {
        appointmentId,
        businessId: appointment.businessId,
        clientId,
        rating: input.rating,
        comment: input.comment,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      throw new DomainError(
        "Esta cita ya tiene una valoración",
        "ALREADY_REVIEWED",
        409,
      );
    }
    throw error;
  }
}

/** Media y número de reseñas de un negocio (0/0 si no tiene ninguna). */
export async function getBusinessReviewSummary(
  businessId: string,
): Promise<{ average: number; count: number }> {
  const agg = await prisma.review.aggregate({
    where: { businessId },
    _avg: { rating: true },
    _count: true,
  });
  return { average: agg._avg.rating ?? 0, count: agg._count };
}
