import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import { toLocalDateISO, toLocalTime } from "@/lib/domain/dates";
import {
  APPOINTMENT_STATUSES,
  STATUS_LABELS,
  type AppointmentStatus,
} from "@/lib/domain/types";

const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estado: z.enum(APPOINTMENT_STATUSES).optional(),
  servicio: z.string().optional(),
  q: z.string().max(100).optional(),
});

// GET /api/admin/export/appointments — CSV de citas con los mismos filtros
// que el listado del panel (hasta 10.000 filas).
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const query = querySchema.parse(
    Object.fromEntries(
      [...url.searchParams.entries()].filter(([, v]) => v !== ""),
    ),
  );

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { timezone: true },
  });

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: admin.businessId,
      ...(query.estado ? { status: query.estado } : {}),
      ...(query.servicio ? { serviceId: query.servicio } : {}),
      ...(query.desde || query.hasta
        ? {
            startAt: {
              ...(query.desde
                ? { gte: new Date(`${query.desde}T00:00:00Z`) }
                : {}),
              ...(query.hasta
                ? { lt: new Date(`${query.hasta}T23:59:59Z`) }
                : {}),
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
    },
    include: {
      service: { select: { name: true } },
      staff: { select: { name: true } },
      client: { select: { name: true, email: true, phone: true } },
      coupon: { select: { code: true } },
    },
    orderBy: { startAt: "desc" },
    take: 10_000,
  });

  const csv = toCsv(
    [
      "Fecha",
      "Hora",
      "Cliente",
      "Email",
      "Teléfono",
      "Servicio",
      "Profesional",
      "Estado",
      "Precio (€)",
      "Descuento (€)",
      "Cobrado (€)",
      "Promoción",
      "Estado del cobro",
    ],
    appointments.map((a) => [
      toLocalDateISO(a.startAt, business.timezone),
      toLocalTime(a.startAt, business.timezone),
      a.client.name,
      a.client.email,
      a.client.phone,
      a.service.name,
      a.staff?.name ?? "",
      STATUS_LABELS[a.status as AppointmentStatus] ?? a.status,
      (a.priceCents / 100).toFixed(2),
      (a.discountCents / 100).toFixed(2),
      (a.chargedCents / 100).toFixed(2),
      a.clientPackageId ? "Bono" : (a.coupon?.code ?? ""),
      a.paymentStatus,
    ]),
  );

  return csvResponse(`citas-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
