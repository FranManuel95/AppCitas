import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { rescheduleAppointment } from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  startAt: z.iso.datetime(),
});

// POST /api/confirmations/[token]/reschedule — reprogramar desde el enlace del
// email (clientes e invitados, sin sesión). El token único es el acceso; 404
// opaco y rate limit por IP. Misma política que en "Mis citas": solo dentro de
// la ventana de cancelación gratuita (RESCHEDULE_WINDOW_PASSED fuera de plazo).
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ token: string }> },
  ) => {
    await enforceRateLimit(request, "confirm-reschedule", {
      limit: 15,
      windowMs: 15 * 60_000,
    });
    const { token } = await params;
    const { startAt } = bodySchema.parse(await request.json());

    const appointment = await prisma.appointment.findUnique({
      where: { confirmationToken: token },
      select: { id: true, clientId: true },
    });
    if (!appointment) {
      throw new DomainError("Enlace no válido", "TOKEN_NOT_FOUND", 404);
    }

    const updated = await rescheduleAppointment({
      appointmentId: appointment.id,
      actorUserId: appointment.clientId,
      actorIsBusinessAdmin: false,
      newStartAt: new Date(startAt),
    });

    return NextResponse.json({
      appointment: {
        id: updated.id,
        startAt: updated.startAt.toISOString(),
        endAt: updated.endAt.toISOString(),
        status: updated.status,
      },
    });
  },
);
