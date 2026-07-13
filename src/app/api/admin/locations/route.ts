import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { createLocation } from "@/lib/domain/locations";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

// GET /api/admin/locations — sedes del negocio.
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const locations = await prisma.location.findMany({
    where: { businessId: admin.businessId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ locations });
});

// POST /api/admin/locations — crea una sede (multi-sede exige equipo activo).
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const input = createSchema.parse(await request.json());
  const location = await createLocation(admin.businessId, input);
  return NextResponse.json({ location }, { status: 201 });
});
