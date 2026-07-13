import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireStaff } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import {
  baseUrl,
  completeCallback,
  verifyCalendarState,
} from "@/lib/calendar/oauth";

// GET /api/staff/calendar/google/callback — retorno de Google del empleado.
export const GET = apiHandler(async (request: Request) => {
  const staff = await apiRequireStaff();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) {
    return NextResponse.redirect(`${baseUrl()}/personal?calendar=error`);
  }

  const state = await verifyCalendarState(stateToken);
  if (
    state.sub !== staff.id ||
    state.businessId !== staff.businessId ||
    state.staffId !== staff.staffId
  ) {
    throw new DomainError(
      "La conexión no corresponde a esta sesión",
      "CALENDAR_STATE_MISMATCH",
      403,
    );
  }

  await completeCallback({
    code,
    state,
    redirectUri: `${baseUrl()}/api/staff/calendar/google/callback`,
  });
  return NextResponse.redirect(`${baseUrl()}/personal?calendar=conectado`);
});
