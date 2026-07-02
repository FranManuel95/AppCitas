import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { isValidDateISO } from "@/lib/domain/dates";
import { DomainError } from "@/lib/domain/errors";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(200).optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const closures = await prisma.closure.findMany({
    where: { businessId: admin.businessId },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ closures });
});

// POST /api/admin/closures — festivo o cierre puntual
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());
  if (!isValidDateISO(data.date)) {
    throw new DomainError("Fecha no válida", "INVALID_DATE");
  }

  const existing = await prisma.closure.findUnique({
    where: {
      businessId_date: { businessId: admin.businessId, date: data.date },
    },
  });
  if (existing) {
    throw new DomainError("Ese día ya está marcado como cerrado", "DUPLICATE", 409);
  }

  const closure = await prisma.closure.create({
    data: {
      businessId: admin.businessId,
      date: data.date,
      reason: data.reason || null,
    },
  });
  return NextResponse.json({ closure }, { status: 201 });
});

const deleteSchema = z.object({ id: z.string().min(1) });

export const DELETE = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const { id } = deleteSchema.parse(await request.json());

  const closure = await prisma.closure.findFirst({
    where: { id, businessId: admin.businessId },
  });
  if (!closure) {
    throw new DomainError("Cierre no encontrado", "NOT_FOUND", 404);
  }

  await prisma.closure.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
});
