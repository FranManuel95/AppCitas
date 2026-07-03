import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { createAppointment } from "@/lib/domain/appointments";
import { cancellationDeadline } from "@/lib/domain/cancellation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertWithinPlan } from "@/lib/domain/plans";

const createSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.iso.datetime(),
  staffId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  // Teléfono para recordatorios por SMS/WhatsApp (se guarda en el perfil)
  phone: z.string().trim().min(6).max(30).optional(),
  // Promoción: cupón o bono del cliente (excluyentes)
  couponCode: z.string().trim().max(30).optional(),
  clientPackageId: z.string().optional(),
});

// POST /api/appointments — reservar (cliente autenticado)
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  // Antiabuso de la reserva (por usuario): tope generoso para no molestar al
  // uso legítimo pero frenar bucles automatizados.
  await enforceRateLimit(
    request,
    "booking",
    { limit: 30, windowMs: 60 * 60_000 },
    user.id,
  );
  const data = createSchema.parse(await request.json());

  // Límite del plan del negocio: citas al mes (402 si lo supera).
  await assertWithinPlan(data.businessId, "createAppointment");

  if (data.phone) {
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: data.phone },
    });
  }

  const appointment = await createAppointment({
    businessId: data.businessId,
    serviceId: data.serviceId,
    clientId: user.id,
    startAt: new Date(data.startAt),
    staffId: data.staffId,
    notes: data.notes,
    couponCode: data.couponCode,
    clientPackageId: data.clientPackageId,
  });

  return NextResponse.json(
    {
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        status: appointment.status,
        priceCents: appointment.priceCents,
        discountCents: appointment.discountCents,
        service: appointment.service.name,
        business: appointment.business.name,
        staff: appointment.staff?.name ?? null,
        freeCancellationUntil: cancellationDeadline(
          appointment.startAt,
          appointment.business.cancellationWindowHours,
        ).toISOString(),
      },
    },
    { status: 201 },
  );
});

// GET /api/appointments — citas del usuario autenticado
export const GET = apiHandler(async () => {
  const user = await apiRequireUser();

  const appointments = await prisma.appointment.findMany({
    where: { clientId: user.id },
    include: {
      service: { select: { name: true, durationMinutes: true } },
      staff: { select: { name: true } },
      business: {
        select: {
          name: true,
          slug: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
        },
      },
    },
    orderBy: { startAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ appointments });
});
