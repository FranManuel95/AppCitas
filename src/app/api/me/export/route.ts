import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { exportUserData } from "@/lib/domain/gdpr";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/me/export — descarga el JSON con todos los datos del usuario
// (derecho de acceso y portabilidad, RGPD arts. 15 y 20).
export const GET = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceRateLimit(
    request,
    "gdpr-export",
    { limit: 5, windowMs: 3_600_000 },
    user.id,
  );

  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="mis-datos-appcitas.json"',
    },
  });
});
