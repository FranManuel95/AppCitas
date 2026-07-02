import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.email().nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  active: z.boolean().optional(),
  serviceIds: z.array(z.string()).max(100).optional(),
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        openTime: z.string().regex(timeRegex),
        closeTime: z.string().regex(timeRegex),
      }),
    )
    .max(28)
    .optional(),
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

export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedStaff(admin.businessId, id);
    const data = updateSchema.parse(await request.json());

    const member = await prisma.$transaction(async (tx) => {
      if (data.hours) {
        await tx.staffHour.deleteMany({ where: { staffId: id } });
        await tx.staffHour.createMany({
          data: data.hours.map((h) => ({ ...h, staffId: id })),
        });
      }
      if (data.serviceIds) {
        await tx.staffService.deleteMany({ where: { staffId: id } });
        await tx.staffService.createMany({
          data: data.serviceIds.map((serviceId) => ({ staffId: id, serviceId })),
        });
      }
      return tx.staffMember.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
        include: {
          hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] },
          services: { select: { serviceId: true } },
        },
      });
    });

    return NextResponse.json({ staff: member });
  },
);

// Empleados con citas se desactivan (integridad del histórico); sin citas se
// eliminan definitivamente.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await ownedStaff(admin.businessId, id);

    const appointmentCount = await prisma.appointment.count({
      where: { staffId: id },
    });
    if (appointmentCount > 0) {
      const member = await prisma.staffMember.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ staff: member, softDeleted: true });
    }

    await prisma.staffMember.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
);
