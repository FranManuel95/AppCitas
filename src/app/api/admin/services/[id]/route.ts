import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  priceCents: z.number().int().min(0).max(1_000_000).optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  active: z.boolean().optional(),
});

async function ownedService(businessId: string, id: string) {
  const service = await prisma.service.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!service) {
    throw new DomainError("Servicio no encontrado", "SERVICE_NOT_FOUND", 404);
  }
}

export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedService(admin.businessId, id);
    const data = updateSchema.parse(await request.json());

    const service = await prisma.service.update({ where: { id }, data });
    return NextResponse.json({ service });
  },
);

// Los servicios con citas asociadas no se borran (integridad del histórico):
// se desactivan y desaparecen de la oferta pública.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedService(admin.businessId, id);

    const appointmentCount = await prisma.appointment.count({
      where: { serviceId: id },
    });

    if (appointmentCount > 0) {
      const service = await prisma.service.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ service, softDeleted: true });
    }

    await prisma.service.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
);
