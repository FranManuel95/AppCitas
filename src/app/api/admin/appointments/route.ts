import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { APPOINTMENT_STATUSES } from "@/lib/domain/types";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  serviceId: z.string().optional(),
  q: z.string().max(100).optional(), // nombre o email del cliente
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/admin/appointments — listado paginado con filtros
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const query = querySchema.parse(
    Object.fromEntries(url.searchParams.entries()),
  );

  const where = {
    businessId: admin.businessId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    ...(query.from || query.to
      ? {
          startAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
            ...(query.to ? { lt: new Date(`${query.to}T23:59:59Z`) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          client: {
            OR: [
              { name: { contains: query.q } },
              { email: { contains: query.q } },
            ],
          },
        }
      : {}),
  };

  const [total, appointments] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: {
        service: { select: { name: true, color: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { startAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page: query.page,
    pageSize: query.pageSize,
    appointments,
  });
});
