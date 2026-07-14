import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { getPublicAvailability } from "@/lib/domain/appointments";
import { toLocalTime } from "@/lib/domain/dates";
import { enforceRateLimit } from "@/lib/rate-limit";

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
    // Endpoint anónimo que dispara varias consultas por petición: límite por
    // IP generoso (el wizard consulta día a día; 120/min da de sobra).
    await enforceRateLimit(request, "availability", {
      limit: 120,
      windowMs: 60_000,
    });

    const { slug } = await params;
    const url = new URL(request.url);
    const { serviceId, date, staffId, location } = querySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const { timezone, slots } = await getPublicAvailability({
      slug,
      serviceId,
      dateISO: date,
      staffId,
      locationId: location,
    });

    return NextResponse.json({
      date,
      timezone,
      slots: slots.map((s) => ({
        startAt: s.start.toISOString(),
        endAt: s.end.toISOString(),
        label: toLocalTime(s.start, timezone),
        staffIds: s.staffIds,
      })),
    });
  },
);
