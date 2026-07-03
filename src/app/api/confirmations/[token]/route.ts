import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import {
  cancelAppointment,
  confirmAttendance,
} from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ attending: z.boolean() });

// POST /api/confirmations/[token] — respuesta al recordatorio de asistencia.
// El token (cuid único por cita) actúa como capacidad: no requiere sesión,
// pensado para responder con un toque desde WhatsApp/SMS/email.
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ token: string }> },
  ) => {
    // Endpoint público y sin firma: se limita por IP para que no se puedan
    // sondear tokens de confirmación por fuerza bruta.
    await enforceRateLimit(request, "confirmation-token", {
      limit: 60,
      windowMs: 3_600_000,
    });
    const { token } = await params;
    const { attending } = bodySchema.parse(await request.json());

    if (attending) {
      const result = await confirmAttendance(token);
      return NextResponse.json({ confirmed: true, id: result.id });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { confirmationToken: token },
      select: { id: true, clientId: true },
    });
    if (!appointment) {
      throw new DomainError("Enlace no válido", "TOKEN_NOT_FOUND", 404);
    }

    // "No asistiré" = cancelación del propio cliente: aplica su política
    const { appointment: updated, outcome } = await cancelAppointment({
      appointmentId: appointment.id,
      actorUserId: appointment.clientId,
      actorIsBusinessAdmin: false,
    });

    return NextResponse.json({
      cancelled: true,
      late: outcome.late,
      chargedCents: outcome.chargedCents,
      status: updated.status,
    });
  },
);
