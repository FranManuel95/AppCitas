import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import {
  baseUrl,
  completeCallback,
  verifyCalendarState,
} from "@/lib/calendar/oauth";

// GET /api/admin/calendar/google/callback — Google devuelve el código.
// El state (JWT) debe corresponder al usuario en sesión y a su negocio.
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) {
    return NextResponse.redirect(`${baseUrl()}/admin/ajustes?calendar=error`);
  }

  const state = await verifyCalendarState(stateToken);
  if (state.sub !== admin.id || state.businessId !== admin.businessId || state.staffId) {
    throw new DomainError(
      "La conexión no corresponde a esta sesión",
      "CALENDAR_STATE_MISMATCH",
      403,
    );
  }

  await completeCallback({
    code,
    state,
    redirectUri: `${baseUrl()}/api/admin/calendar/google/callback`,
  });
  return NextResponse.redirect(`${baseUrl()}/admin/ajustes?calendar=conectado`);
});
