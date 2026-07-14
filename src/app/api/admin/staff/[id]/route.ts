import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { assertServicesOwned } from "@/lib/domain/ownership";

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
  // Overrides opcionales de duración/precio por servicio de este empleado.
  serviceOverrides: z
    .array(
      z.object({
        serviceId: z.string(),
        durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
        priceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .max(100)
    .optional(),
  // Sede asignada (null = todas las sedes)
  locationId: z.string().nullable().optional(),
  // % de comisión (informe de ingresos por empleado); null = sin comisión
  commissionPercent: z.number().int().min(0).max(100).nullable().optional(),
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

    // Aislamiento: los servicios vinculados deben ser del propio negocio.
    await assertServicesOwned(admin.businessId, data.serviceIds);

    // Aislamiento: la sede asignada debe ser del propio negocio y activa.
    if (data.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: data.locationId, businessId: admin.businessId, active: true },
        select: { id: true },
      });
      if (!location) {
        throw new DomainError("Sede no encontrada", "LOCATION_NOT_FOUND", 404);
      }
    }

    const member = await prisma.$transaction(async (tx) => {
      if (data.hours) {
        await tx.staffHour.deleteMany({ where: { staffId: id } });
        await tx.staffHour.createMany({
          data: data.hours.map((h) => ({ ...h, staffId: id })),
        });
      }
      if (data.serviceIds) {
        const overrides = new Map(
          (data.serviceOverrides ?? []).map((o) => [o.serviceId, o]),
        );
        await tx.staffService.deleteMany({ where: { staffId: id } });
        await tx.staffService.createMany({
          // Dedupe: ids repetidos violarían el PK compuesto (P2002 → 500).
          data: [...new Set(data.serviceIds)].map((serviceId) => {
            const o = overrides.get(serviceId);
            return {
              staffId: id,
              serviceId,
              durationMinutes: o?.durationMinutes ?? null,
              priceCents: o?.priceCents ?? null,
            };
          }),
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
          ...(data.locationId !== undefined
            ? { locationId: data.locationId }
            : {}),
          ...(data.commissionPercent !== undefined
            ? { commissionPercent: data.commissionPercent }
            : {}),
        },
        include: {
          hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] },
          services: {
            select: { serviceId: true, durationMinutes: true, priceCents: true },
          },
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
