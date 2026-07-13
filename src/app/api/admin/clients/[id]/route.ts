import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { updateClientBirthDate } from "@/lib/domain/clients";
import { isValidDateISO } from "@/lib/domain/dates";

const bodySchema = z.object({
  birthDate: z
    .string()
    .refine(isValidDateISO, "Fecha inválida (YYYY-MM-DD)")
    .nullable(),
});

// PATCH /api/admin/clients/[id] — hoy solo edita el cumpleaños (clientes de
// mostrador/importados; la fecha que aportó una cuenta propia no se pisa).
export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { birthDate } = bodySchema.parse(await request.json());

    const client = await updateClientBirthDate({
      businessId: admin.businessId,
      clientId: id,
      birthDate,
    });
    return NextResponse.json({ client });
  },
);
