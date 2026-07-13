import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { getLoyaltyProgram, upsertLoyaltyProgram } from "@/lib/domain/loyalty";

const schema = z.object({
  active: z.boolean(),
  stampsRequired: z.number().int().min(2).max(50),
  rewardPercent: z.number().int().min(1).max(100),
  rewardValidityDays: z.number().int().min(7).max(730),
});

// GET/PUT /api/admin/loyalty — configuración de la tarjeta de sellos.
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const program = await getLoyaltyProgram(admin.businessId);
  return NextResponse.json({ program });
});

export const PUT = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const input = schema.parse(await request.json());
  const program = await upsertLoyaltyProgram(admin.businessId, input);
  return NextResponse.json({ program });
});
