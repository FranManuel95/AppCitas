import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { createPortalSession } from "@/lib/billing";

// POST /api/billing/portal — abre (o simula) el portal de facturación de Stripe
// para gestionar o cancelar la suscripción del negocio.
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const { url } = await createPortalSession({
    businessId: admin.businessId,
    returnUrl: `${baseUrl}/admin/plan`,
  });

  return NextResponse.json({ url });
});
