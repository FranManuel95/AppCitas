import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireStaff } from "@/lib/auth/guards";
import { googleAuthUrl, isCalendarConfigured } from "@/lib/calendar/google";
import {
  baseUrl,
  createSimulatedConnection,
  signCalendarState,
} from "@/lib/calendar/oauth";

// GET /api/staff/calendar/google/connect — el empleado conecta SU calendario
// desde su portal (/personal). Sin claves: simulado en desarrollo.
export const GET = apiHandler(async () => {
  const staff = await apiRequireStaff();

  if (!isCalendarConfigured()) {
    await createSimulatedConnection({
      businessId: staff.businessId,
      staffId: staff.staffId,
    });
    return NextResponse.redirect(`${baseUrl()}/personal?calendar=conectado`);
  }

  const state = await signCalendarState({
    sub: staff.id,
    businessId: staff.businessId,
    staffId: staff.staffId,
  });
  const redirectUri = `${baseUrl()}/api/staff/calendar/google/callback`;
  return NextResponse.redirect(googleAuthUrl(state, redirectUri));
});
