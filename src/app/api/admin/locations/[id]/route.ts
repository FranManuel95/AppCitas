import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { updateLocation } from "@/lib/domain/locations";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/admin/locations/[id] — edita o activa/desactiva una sede
// (no se desactiva con empleados asignados).
export const PATCH = apiHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await apiRequireBusinessAdmin();
    const { id } = await params;
    const input = patchSchema.parse(await request.json());
    const location = await updateLocation(admin.businessId, id, input);
    return NextResponse.json({ location });
  },
);
