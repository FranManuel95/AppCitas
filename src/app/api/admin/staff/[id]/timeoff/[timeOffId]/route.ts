import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

// DELETE /api/admin/staff/[id]/timeoff/[timeOffId] — elimina una ausencia.
// La propiedad se comprueba a través de la relación empleado → negocio.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string; timeOffId: string }> },
  ) => {
    const { id, timeOffId } = await params;
    const admin = await apiRequireBusinessAdmin();

    const timeOff = await prisma.staffTimeOff.findFirst({
      where: {
        id: timeOffId,
        staffId: id,
        staff: { businessId: admin.businessId },
      },
      select: { id: true },
    });
    if (!timeOff) {
      throw new DomainError("Ausencia no encontrada", "TIMEOFF_NOT_FOUND", 404);
    }

    await prisma.staffTimeOff.delete({ where: { id: timeOffId } });
    return NextResponse.json({ deleted: true });
  },
);
