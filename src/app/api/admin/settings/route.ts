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
  // Visibilidad en el marketplace (false = solo enlace directo/QR)
  listedInMarketplace: z.boolean().optional(),
  // Política de reservas y cancelación
  cancellationWindowHours: z.number().int().min(0).max(24 * 30).optional(),
  lateCancellationFeePercent: z.number().int().min(0).max(100).optional(),
  // Descuento automático de última hora (reservas que empiezan en <24 h)
  lastMinuteDiscountPercent: z.number().int().min(0).max(90).optional(),
  slotGranularityMinutes: z.number().int().min(5).max(120).optional(),
  maxAdvanceBookingDays: z.number().int().min(1).max(365).optional(),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
  // Pagos
  requireCardToBook: z.boolean().optional(),
  // Señal (prepago) al reservar: % del precio, 0 = desactivada
  depositPercent: z.number().int().min(0).max(100).optional(),
  // Recordatorios y canales
  remindersEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(24 * 14).optional(),
  // Segundo recordatorio más cercano a la cita (null = desactivado)
  reminder2HoursBefore: z.number().int().min(1).max(168).nullable().optional(),
  // Cierre automático de citas pasadas (CONFIRMED → COMPLETED tras 24 h)
  autoCompleteEnabled: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  notifyBySms: z.boolean().optional(),
  notifyByWhatsapp: z.boolean().optional(),
  // Facturación de recibos
  taxId: z.string().trim().max(30).nullable().optional(),
  taxPercent: z.number().int().min(0).max(50).optional(),
  // Marca en la página pública y el widget
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  logoUrl: z.url().startsWith("https://").max(300).nullable().optional(),
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
