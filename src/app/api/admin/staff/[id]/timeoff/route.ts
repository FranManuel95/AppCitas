import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { isValidDateISO } from "@/lib/domain/dates";

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().trim().max(100).optional(),
});

async function ownedStaff(businessId: string, id: string) {
  const member = await prisma.staffMember.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!member) {
    throw new DomainError("Empleado no encontrado", "STAFF_NOT_FOUND", 404);
  }
}

// GET /api/admin/staff/[id]/timeoff — ausencias del empleado (futuras primero)
export const GET = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedStaff(admin.businessId, id);

    const timeOff = await prisma.staffTimeOff.findMany({
      where: { staffId: id },
      orderBy: { startDate: "desc" },
      take: 50,
    });
    return NextResponse.json({ timeOff });
  },
);

// POST /api/admin/staff/[id]/timeoff — nueva ausencia (rango de días inclusivo)
export const POST = apiHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedStaff(admin.businessId, id);
    const data = createSchema.parse(await request.json());

    if (!isValidDateISO(data.startDate) || !isValidDateISO(data.endDate)) {
      throw new DomainError("Fecha no válida", "INVALID_DATE");
    }
    if (data.endDate < data.startDate) {
      throw new DomainError(
        "El fin de la ausencia no puede ser anterior al inicio",
        "INVALID_RANGE",
      );
    }

    const timeOff = await prisma.staffTimeOff.create({
      data: {
        staffId: id,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason || null,
      },
    });
    return NextResponse.json({ timeOff }, { status: 201 });
  },
);
