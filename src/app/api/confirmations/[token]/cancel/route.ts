import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { cancelAppointment } from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/confirmations/[token]/cancel — cancelación desde el enlace del
// email (clientes e invitados, sin sesión). El token único es el acceso;
// 404 opaco y rate limit por IP contra la enumeración. Aplica la MISMA
// política de cancelación que si el cliente cancelara desde su cuenta.
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ token: string }> },
  ) => {
    await enforceRateLimit(request, "confirm-cancel", {
      limit: 10,
      windowMs: 15 * 60_000,
    });
    const { token } = await params;

    const appointment = await prisma.appointment.findUnique({
      where: { confirmationToken: token },
      select: { id: true, clientId: true },
    });
    if (!appointment) {
      throw new DomainError("Enlace no válido", "TOKEN_NOT_FOUND", 404);
    }

    const result = await cancelAppointment({
      appointmentId: appointment.id,
      actorUserId: appointment.clientId,
      actorIsBusinessAdmin: false,
    });

    return NextResponse.json({
      status: result.appointment.status,
      chargedCents: result.appointment.chargedCents,
    });
  },
);
