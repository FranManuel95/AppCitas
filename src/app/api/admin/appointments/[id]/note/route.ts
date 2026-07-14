import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";

const bodySchema = z.object({
  internalNote: z.string().trim().max(1000).nullable(),
});

// PATCH /api/admin/appointments/[id]/note — nota interna del equipo sobre la
// cita. Nunca se muestra al cliente (la nota del cliente vive en `notes`).
export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { internalNote } = bodySchema.parse(await request.json());

    const updated = await prisma.appointment.updateMany({
      where: { id, businessId: admin.businessId },
      data: { internalNote: internalNote || null },
    });
    if (updated.count === 0) {
      throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
    }
    return NextResponse.json({ ok: true });
  },
);
