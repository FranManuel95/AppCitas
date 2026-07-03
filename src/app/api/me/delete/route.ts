import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { deleteOwnAccount } from "@/lib/domain/gdpr";
import { destroySession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/me/delete — el cliente elimina (anonimiza) su cuenta. Las citas se
// conservan disociadas por la contabilidad del negocio; la sesión se cierra y
// se invalida en todos los dispositivos (RGPD art. 17).
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceRateLimit(
    request,
    "gdpr-delete",
    { limit: 5, windowMs: 3_600_000 },
    user.id,
  );

  await deleteOwnAccount(user.id);
  await destroySession();

  return NextResponse.json({ deleted: true });
});
