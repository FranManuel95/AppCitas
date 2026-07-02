import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireStaff } from "@/lib/auth/guards";
import { setAppointmentStatus } from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";

const bodySchema = z.object({
  // El empleado registra el desenlace de SUS citas; cancelar en nombre del
  // negocio queda reservado al dueño.
  status: z.enum(["COMPLETED", "NO_SHOW", "CONFIRMED"]),
});

// PATCH /api/staff/appointments/[id]/status
export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const staff = await apiRequireStaff();
    const { status } = bodySchema.parse(await request.json());

    const appointment = await prisma.appointment.findFirst({
      where: { id, businessId: staff.businessId, staffId: staff.staffId },
      select: { id: true },
    });
    if (!appointment) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }

    const updated = await setAppointmentStatus({
      appointmentId: id,
      businessId: staff.businessId,
      status,
    });

    return NextResponse.json({ appointment: updated });
  },
);
