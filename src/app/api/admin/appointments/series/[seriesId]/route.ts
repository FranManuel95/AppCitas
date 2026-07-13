import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import {
  cancelSeriesRemainder,
  rescheduleSeriesRemainder,
} from "@/lib/domain/recurring";

const rescheduleSchema = z.object({ startAt: z.iso.datetime() });

// PATCH — mueve lo que queda de la serie: el nuevo inicio se aplica a la
// próxima cita futura y el resto se desplaza el mismo delta con la misma
// hora; los huecos en conflicto se omiten y se devuelven.
export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ seriesId: string }> },
  ) => {
    const { seriesId } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { startAt } = rescheduleSchema.parse(await request.json());

    const result = await rescheduleSeriesRemainder({
      businessId: admin.businessId,
      seriesId,
      actorUserId: admin.id,
      newStartAt: new Date(startAt),
    });
    return NextResponse.json({
      moved: result.moved.length,
      skipped: result.skipped.map((s) => ({
        startAt: s.startAt.toISOString(),
        code: s.code,
      })),
    });
  },
);

// DELETE /api/admin/appointments/series/[seriesId] — cancela lo que queda de
// la serie (citas confirmadas futuras). Cancela el negocio → sin cargo.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ seriesId: string }> },
  ) => {
    const { seriesId } = await params;
    const admin = await apiRequireBusinessAdmin();

    const result = await cancelSeriesRemainder({
      businessId: admin.businessId,
      seriesId,
      actorUserId: admin.id,
    });
    return NextResponse.json(result);
  },
);
