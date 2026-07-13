import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { googleAuthUrl, isCalendarConfigured } from "@/lib/calendar/google";
import {
  baseUrl,
  createSimulatedConnection,
  signCalendarState,
} from "@/lib/calendar/oauth";

// GET /api/admin/calendar/google/connect — inicia la conexión del calendario
// del NEGOCIO (dueño). Sin claves de Google: conexión simulada en desarrollo.
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();

  if (!isCalendarConfigured()) {
    await createSimulatedConnection({
      businessId: admin.businessId,
      staffId: null,
    });
    return NextResponse.redirect(`${baseUrl()}/admin/ajustes?calendar=conectado`);
  }

  const state = await signCalendarState({
    sub: admin.id,
    businessId: admin.businessId,
  });
  const redirectUri = `${baseUrl()}/api/admin/calendar/google/callback`;
  return NextResponse.redirect(googleAuthUrl(state, redirectUri));
});
