import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { setAppointmentStatus } from "@/lib/domain/appointments";
import {
  APPOINTMENT_STATUSES,
  IN_PERSON_PAYMENT_METHODS,
} from "@/lib/domain/types";

const bodySchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  // Forma de cobro presencial al completar (opcional; el dominio usa CASH por defecto).
  paymentMethod: z.enum(IN_PERSON_PAYMENT_METHODS).optional(),
});

// PATCH /api/admin/appointments/[id]/status
// Registro operativo del negocio: completar, marcar no-show, etc.
// El cargo asociado se recalcula según el estado (ver setAppointmentStatus).
export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { status, paymentMethod } = bodySchema.parse(await request.json());

    const appointment = await setAppointmentStatus({
      appointmentId: id,
      businessId: admin.businessId,
      status,
      paymentMethod,
    });

    return NextResponse.json({ appointment });
  },
);
