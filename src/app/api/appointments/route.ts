import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { createAppointment } from "@/lib/domain/appointments";
import { cancellationDeadline } from "@/lib/domain/cancellation";

const createSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.iso.datetime(),
  notes: z.string().trim().max(500).optional(),
});

// POST /api/appointments — reservar (cliente autenticado)
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const data = createSchema.parse(await request.json());

  const appointment = await createAppointment({
    businessId: data.businessId,
    serviceId: data.serviceId,
    clientId: user.id,
    startAt: new Date(data.startAt),
    notes: data.notes,
  });

  return NextResponse.json(
    {
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        status: appointment.status,
        priceCents: appointment.priceCents,
        service: appointment.service.name,
        business: appointment.business.name,
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
