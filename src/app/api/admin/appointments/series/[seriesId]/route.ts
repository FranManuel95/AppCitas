import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { cancelSeriesRemainder } from "@/lib/domain/recurring";

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
