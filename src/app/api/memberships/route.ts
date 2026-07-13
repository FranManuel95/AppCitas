import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { subscribeToPlan } from "@/lib/payments/memberships";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ planId: z.string().min(1) });

// POST /api/memberships — alta del cliente autenticado en un plan de
// membresía (cuota mensual con descuento en las citas del negocio).
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceRateLimit(request, "memberships", {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  const { planId } = schema.parse(await request.json());

  const membership = await subscribeToPlan({ clientId: user.id, planId });
  return NextResponse.json(
    {
      membership: {
        id: membership.id,
        status: membership.status,
        currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
      },
    },
    { status: 201 },
  );
});
