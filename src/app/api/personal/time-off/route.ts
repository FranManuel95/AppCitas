import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireStaff } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { isValidDateISO } from "@/lib/domain/dates";

// Autogestión del portal del empleado: el propio STAFF crea/borra SUS ausencias
// (vacaciones, baja). Todo acotado a su staffId de sesión: nunca puede tocar las
// de otro empleado ni las de otro negocio.

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().trim().max(100).optional(),
});

// POST /api/personal/time-off — nueva ausencia propia (rango inclusivo)
export const POST = apiHandler(async (request: Request) => {
  const staff = await apiRequireStaff();
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
      staffId: staff.staffId,
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason || null,
    },
  });
  return NextResponse.json({ timeOff }, { status: 201 });
});

const deleteSchema = z.object({ id: z.string().min(1) });

// DELETE /api/personal/time-off — borra una ausencia propia (acotada a staffId)
export const DELETE = apiHandler(async (request: Request) => {
  const staff = await apiRequireStaff();
  const { id } = deleteSchema.parse(await request.json());

  const result = await prisma.staffTimeOff.deleteMany({
    where: { id, staffId: staff.staffId },
  });
  if (result.count === 0) {
    throw new DomainError("Ausencia no encontrada", "NOT_FOUND", 404);
  }
  return NextResponse.json({ deleted: true });
});
