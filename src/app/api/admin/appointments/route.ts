import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { APPOINTMENT_STATUSES } from "@/lib/domain/types";
import { createAppointment } from "@/lib/domain/appointments";
import {
  createRecurringAppointments,
  MAX_SERIES_COUNT,
} from "@/lib/domain/recurring";
import { findOrCreateGuestClient } from "@/lib/domain/guest-clients";

const createSchema = z.object({
  serviceId: z.string().min(1),
  startAt: z.iso.datetime(),
  staffId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  // Datos del cliente de mostrador/teléfono: con email se reutiliza (o crea)
  // su cuenta; sin email basta el nombre (y teléfono si lo da).
  client: z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email().toLowerCase().optional(),
      phone: z.string().trim().min(6).max(30).optional(),
    })
    .refine((c) => c.email || c.phone || c.name, {
      message: "Faltan los datos del cliente",
    }),
  // Serie recurrente opcional: repite la misma hora de pared cada 7/14/28 días
  recurrence: z
    .object({
      intervalDays: z.union([z.literal(7), z.literal(14), z.literal(28)]),
      count: z.number().int().min(2).max(MAX_SERIES_COUNT),
    })
    .optional(),
});

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  serviceId: z.string().optional(),
  q: z.string().max(100).optional(), // nombre o email del cliente
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/admin/appointments — listado paginado con filtros
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const query = querySchema.parse(
    Object.fromEntries(url.searchParams.entries()),
  );

  const where = {
    businessId: admin.businessId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    ...(query.from || query.to
      ? {
          startAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
            ...(query.to ? { lt: new Date(`${query.to}T23:59:59Z`) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          client: {
            OR: [
              { name: { contains: query.q } },
              { email: { contains: query.q } },
            ],
          },
        }
      : {}),
  };

  const [total, appointments] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: {
        service: { select: { name: true, color: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { startAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page: query.page,
    pageSize: query.pageSize,
    appointments,
  });
});

// POST /api/admin/appointments — cita manual del negocio (mostrador/teléfono).
// Reutiliza el MISMO camino transaccional anti doble-reserva que la reserva
// online; bookedBy: "business" salta la antelación mínima y la señal.
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());

  const { clientId } = await findOrCreateGuestClient({
    name: data.client.name,
    email: data.client.email,
    phone: data.client.phone,
    // El negocio puede apuntar citas a clientes ya registrados (teléfono)
    allowClaimedAccounts: true,
  });

  // Serie recurrente: crea todas las ocurrencias posibles y devuelve el
  // resumen (las que chocan con huecos ocupados/cierres quedan omitidas).
  if (data.recurrence) {
    const result = await createRecurringAppointments({
      businessId: admin.businessId,
      serviceId: data.serviceId,
      clientId,
      startAt: new Date(data.startAt),
      staffId: data.staffId,
      notes: data.notes,
      intervalDays: data.recurrence.intervalDays,
      count: data.recurrence.count,
    });
    return NextResponse.json(
      {
        seriesId: result.seriesId,
        created: result.created.map((a) => ({
          id: a.id,
          startAt: a.startAt.toISOString(),
        })),
        skipped: result.skipped.map((s) => ({
          startAt: s.startAt.toISOString(),
          code: s.code,
        })),
      },
      { status: 201 },
    );
  }

  const appointment = await createAppointment({
    businessId: admin.businessId,
    serviceId: data.serviceId,
    clientId,
    startAt: new Date(data.startAt),
    staffId: data.staffId,
    notes: data.notes,
    bookedBy: "business",
  });

  return NextResponse.json(
    {
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt.toISOString(),
        status: appointment.status,
        service: appointment.service.name,
        staff: appointment.staff?.name ?? null,
      },
    },
    { status: 201 },
  );
});
