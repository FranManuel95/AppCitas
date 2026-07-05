import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { refreshConnectAccount } from "@/lib/billing/connect";

// POST /api/admin/connect/refresh — consulta a Stripe el estado actual de la
// cuenta conectada del negocio y lo sincroniza (respaldo del webhook).
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const summary = await refreshConnectAccount(admin.businessId);
  return NextResponse.json({ summary });
});
