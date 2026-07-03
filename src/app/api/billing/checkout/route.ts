import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { createCheckoutSession } from "@/lib/billing";

// POST /api/billing/checkout — inicia (o simula) la suscripción Pro del negocio
// y devuelve la URL a la que redirigir al administrador.
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const { url } = await createCheckoutSession({
    businessId: admin.businessId,
    ownerEmail: admin.email,
    successUrl: `${baseUrl}/admin/plan?estado=ok`,
    cancelUrl: `${baseUrl}/admin/plan?estado=cancelado`,
  });

  return NextResponse.json({ url });
});
