import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { rescheduleAppointment } from "@/lib/domain/appointments";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import { enforceUserRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  startAt: z.iso.datetime(),
});

// POST /api/appointments/[id]/reschedule
// El cliente mueve su cita a otro hueco dentro de la ventana gratuita; fuera
// de plazo solo puede cancelar (RESCHEDULE_WINDOW_PASSED, 422).
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const user = await apiRequireUser();
    await enforceUserRateLimit(user.id, "reschedule", {
      limit: 30,
      windowMs: 60 * 60_000,
    });
    const { startAt } = bodySchema.parse(await request.json());

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: { businessId: true, clientId: true },
    });
    if (!appointment) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }

    const actorIsBusinessAdmin =
      ADMIN_ROLES.includes(user.role) &&
      user.businessId === appointment.businessId;

    // No filtrar la existencia entre tenants: si la cita no es del cliente ni
    // de su negocio, 404 (no 403), igual que la ruta admin. Sin esto, 403 vs
    // 404 revelaba si un id ajeno existe.
    if (!actorIsBusinessAdmin && appointment.clientId !== user.id) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }

    const updated = await rescheduleAppointment({
      appointmentId: id,
      actorUserId: user.id,
      actorIsBusinessAdmin,
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
