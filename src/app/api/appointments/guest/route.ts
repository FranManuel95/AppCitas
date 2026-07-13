import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { createGuestAppointment } from "@/lib/domain/guest-booking";
import { cancellationDeadline } from "@/lib/domain/cancellation";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.iso.datetime(),
  staffId: z.string().optional(),
  locationId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  couponCode: z.string().trim().max(30).optional(),
  guest: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    phone: z.string().trim().min(6).max(30).optional(),
  }),
  consent: z.literal(true),
});

// POST /api/appointments/guest — reservar sin cuenta. Ruta separada de
// /api/appointments: contrato de autenticación y límites distintos.
export const POST = apiHandler(async (request: Request) => {
  const data = schema.parse(await request.json());
  // Antiabuso doble: por IP y por email (frena tanto el bucle anónimo como el
  // spam de reservas dirigido a un mismo buzón ajeno).
  await enforceRateLimit(request, "booking-guest", {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  await enforceRateLimit(
    request,
    "booking-guest-email",
    { limit: 5, windowMs: 60 * 60_000 },
    data.guest.email,
  );

  const appointment = await createGuestAppointment({
    businessId: data.businessId,
    serviceId: data.serviceId,
    startAt: new Date(data.startAt),
    staffId: data.staffId,
    locationId: data.locationId,
    notes: data.notes,
    couponCode: data.couponCode,
    guest: data.guest,
    consent: data.consent,
  });

  return NextResponse.json(
    {
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt.toISOString(),
        status: appointment.status,
        priceCents: appointment.priceCents,
        service: appointment.service.name,
        business: appointment.business.name,
        staff: appointment.staff?.name ?? null,
        freeCancellationUntil: cancellationDeadline(
          appointment.startAt,
          appointment.business.cancellationWindowHours,
        ).toISOString(),
      },
      // Gestión sin cuenta: la misma página del enlace del email
      manageUrl: `/c/${appointment.confirmationToken}`,
    },
    { status: 201 },
  );
});
