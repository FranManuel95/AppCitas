import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { startConnectOnboarding } from "@/lib/billing/connect";

// POST /api/admin/connect — inicia (o reanuda) el onboarding de la cuenta
// conectada del negocio para recibir los cobros B2C, y devuelve la URL a la
// que redirigir al administrador.
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const { url } = await startConnectOnboarding({
    businessId: admin.businessId,
    ownerEmail: admin.email,
    refreshUrl: `${baseUrl}/admin/cobros?estado=refresh`,
    returnUrl: `${baseUrl}/admin/cobros?estado=ok`,
  });

  return NextResponse.json({ url });
});
