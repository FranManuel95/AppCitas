import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { getAvailability } from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";
import { toLocalTime } from "@/lib/domain/dates";

const querySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
  staffId: z.string().optional(),
  location: z.string().optional(),
});

// GET /api/businesses/[slug]/availability?serviceId=…&date=YYYY-MM-DD[&staffId=…]
// Público: los huecos libres no revelan datos de otras citas.
export const GET = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
  ) => {
    const { slug } = await params;
    const url = new URL(request.url);
    const { serviceId, date, staffId, location } = querySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const business = await prisma.business.findFirst({
      where: { slug, active: true },
      select: { id: true, timezone: true },
    });
    if (!business) {
      throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
    }

    const slots = await getAvailability({
      businessId: business.id,
      serviceId,
      dateISO: date,
      staffId,
      locationId: location,
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
  },
);
