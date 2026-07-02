import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  category: z.string().trim().max(50).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  // Política de reservas y cancelación
  cancellationWindowHours: z.number().int().min(0).max(24 * 30).optional(),
  lateCancellationFeePercent: z.number().int().min(0).max(100).optional(),
  slotGranularityMinutes: z.number().int().min(5).max(120).optional(),
  maxAdvanceBookingDays: z.number().int().min(1).max(365).optional(),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
  // Pagos
  requireCardToBook: z.boolean().optional(),
  // Recordatorios y canales
  remindersEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(24 * 14).optional(),
  notifyByEmail: z.boolean().optional(),
  notifyBySms: z.boolean().optional(),
  notifyByWhatsapp: z.boolean().optional(),
  // Facturación de recibos
  taxId: z.string().trim().max(30).nullable().optional(),
  taxPercent: z.number().int().min(0).max(50).optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    include: { hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] } },
  });
  return NextResponse.json({ business });
});

export const PATCH = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = updateSchema.parse(await request.json());

  const business = await prisma.business.update({
    where: { id: admin.businessId },
    data,
  });
  return NextResponse.json({ business });
});
