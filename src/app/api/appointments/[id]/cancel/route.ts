import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { cancelAppointment } from "@/lib/domain/appointments";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";

// POST /api/appointments/[id]/cancel
// Aplica la política del negocio: gratis dentro de plazo; fuera de plazo se
// mantiene el cargo configurado (por defecto, el importe íntegro de la cita).
export const POST = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const user = await apiRequireUser();

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: { businessId: true },
    });
    if (!appointment) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }

    const actorIsBusinessAdmin =
      ADMIN_ROLES.includes(user.role) &&
      user.businessId === appointment.businessId;

    const { appointment: updated, outcome } = await cancelAppointment({
      appointmentId: id,
      actorUserId: user.id,
      actorIsBusinessAdmin,
    });

    return NextResponse.json({
      appointment: {
        id: updated.id,
        status: updated.status,
        chargedCents: updated.chargedCents,
      },
      late: outcome.late,
      chargedCents: outcome.chargedCents,
    });
  },
);
