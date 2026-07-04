import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { joinWaitlist } from "@/lib/domain/waitlist";
import { enforceUserRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
  staffId: z.string().optional(),
});

// POST /api/waitlist — el cliente se apunta a la lista de espera de un servicio
// para un día concreto (cuando no hay hueco).
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceUserRateLimit(user.id, "waitlist", {
    limit: 30,
    windowMs: 60 * 60_000,
  });
  const data = bodySchema.parse(await request.json());

  const entry = await joinWaitlist({
    businessId: data.businessId,
    serviceId: data.serviceId,
    clientId: user.id,
    desiredDate: data.desiredDate,
    staffId: data.staffId,
  });

  return NextResponse.json(
    { entry: { id: entry.id, status: entry.status } },
    { status: 201 },
  );
});
