import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        openTime: z.string().regex(timeRegex),
        closeTime: z.string().regex(timeRegex),
      }),
    )
    .max(28), // hasta 4 tramos por día
});

// PUT /api/admin/hours — reemplaza el horario semanal completo.
// Semántica de reemplazo total: el editor del panel envía el estado deseado.
export const PUT = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const { hours } = bodySchema.parse(await request.json());

  for (const h of hours) {
    if (h.openTime >= h.closeTime) {
      throw new DomainError(
        `Tramo inválido: ${h.openTime}–${h.closeTime} (la apertura debe ser anterior al cierre)`,
        "INVALID_RANGE",
      );
    }
  }

  // Tramos del mismo día no pueden solaparse entre sí
  for (let weekday = 0; weekday <= 6; weekday++) {
    const day = hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.openTime.localeCompare(b.openTime));
    for (let i = 1; i < day.length; i++) {
      if (day[i].openTime < day[i - 1].closeTime) {
        throw new DomainError(
          `Los tramos del día se solapan: ${day[i - 1].openTime}–${day[i - 1].closeTime} y ${day[i].openTime}–${day[i].closeTime}`,
          "OVERLAPPING_RANGES",
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.businessHour.deleteMany({
      where: { businessId: admin.businessId },
    });
    await tx.businessHour.createMany({
      data: hours.map((h) => ({ ...h, businessId: admin.businessId })),
    });
    return tx.businessHour.findMany({
      where: { businessId: admin.businessId },
      orderBy: [{ weekday: "asc" }, { openTime: "asc" }],
    });
  });

  return NextResponse.json({ hours: updated });
});
