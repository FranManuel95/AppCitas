import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { getAvailability } from "@/lib/domain/appointments";
import { toLocalTime } from "@/lib/domain/dates";

const querySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
  staffId: z.string().optional(),
  locationId: z.string().optional(),
});

// GET /api/admin/availability — huecos para la cita manual del negocio.
// Misma forma de respuesta que la ruta pública, pero SIN la antelación
// mínima: el mostrador reserva "para dentro de 20 minutos".
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const { serviceId, date, staffId, locationId } = querySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { timezone: true },
  });

  const slots = await getAvailability({
    businessId: admin.businessId,
    serviceId,
    dateISO: date,
    staffId,
    locationId,
    relaxMinNotice: true,
  });

  return NextResponse.json({
    date,
    timezone: business.timezone,
    slots: slots.map((s) => ({
      startAt: s.start.toISOString(),
      endAt: s.end.toISOString(),
      label: toLocalTime(s.start, business.timezone),
      staffIds: s.staffIds,
    })),
  });
});
