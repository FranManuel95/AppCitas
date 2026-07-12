import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireSuperAdmin } from "@/lib/auth/guards";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/lib/domain/platform-settings";

const updateSchema = z.object({
  fixedMonthlyCostCents: z.number().int().min(0).optional(),
  whatsappMsgCostCents: z.number().int().min(0).optional(),
  smsMsgCostCents: z.number().int().min(0).optional(),
  stripeFeeBps: z.number().int().min(0).max(2000).optional(),
  stripeFeeFixedCents: z.number().int().min(0).optional(),
});

// GET/PATCH /api/superadmin/settings — costes de la plataforma (fila única)
export const GET = apiHandler(async () => {
  await apiRequireSuperAdmin();
  return NextResponse.json({ settings: await getPlatformSettings() });
});

export const PATCH = apiHandler(async (request: Request) => {
  await apiRequireSuperAdmin();
  const data = updateSchema.parse(await request.json());
  const settings = await updatePlatformSettings(data);
  return NextResponse.json({ settings });
});
