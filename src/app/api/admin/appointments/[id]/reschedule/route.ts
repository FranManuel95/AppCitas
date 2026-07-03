import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { rescheduleAppointment } from "@/lib/domain/appointments";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";

const bodySchema = z.object({
  startAt: z.iso.datetime(),
});

// POST /api/admin/appointments/[id]/reschedule
// El negocio puede mover la cita sin la restricción de ventana del cliente,
// siempre que esté confirmada, no haya comenzado y el hueco nuevo tenga sitio.
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { startAt } = bodySchema.parse(await request.json());

    // Solo citas del propio negocio (404 para no revelar citas ajenas)
    const appointment = await prisma.appointment.findFirst({
      where: { id, businessId: admin.businessId },
      select: { id: true },
    });
    if (!appointment) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }

    const updated = await rescheduleAppointment({
      appointmentId: id,
      actorUserId: admin.id,
      actorIsBusinessAdmin: true,
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
