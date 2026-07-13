import { NextResponse } from "next/server";
import { handleWatchNotification } from "@/lib/calendar/watch";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/calendar/google/webhook — notificaciones push de Google Calendar.
// Sin auth de sesión: la autenticidad la da el par opaco (channelId, token)
// de cada canal, comparado en tiempo constante. Devuelve 200 SIEMPRE (también
// con canal desconocido o token inválido): cualquier otro código haría que
// Google reintentara en bucle. Coste de un abuso: una consulta indexada.
export async function POST(request: Request) {
  try {
    await handleWatchNotification({
      channelId: request.headers.get("x-goog-channel-id"),
      token: request.headers.get("x-goog-channel-token"),
      state: request.headers.get("x-goog-resource-state"),
    });
  } catch (error) {
    logError("calendar.webhook.failed", error);
  }
  return new NextResponse(null, { status: 200 });
}
