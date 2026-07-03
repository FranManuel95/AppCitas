import { NextResponse } from "next/server";
import { processDueNotifications } from "@/lib/notifications/service";
import { closePastAppointments } from "@/lib/domain/auto-close";
import { cleanupRateLimitCounters } from "@/lib/rate-limit";
import { degradeExpiredTrials } from "@/lib/domain/plans";

// /api/jobs/notifications — despacha los mensajes vencidos del outbox.
// Pensado para invocarse cada minuto desde un cron externo (Vercel Cron usa
// GET, otros crons pueden usar POST) o desde el worker local (npm run worker).
// Protegido con CRON_SECRET para que nadie pueda dispararlo desde fuera.
async function handleCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");

  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 501 },
    );
  }
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await processDueNotifications();
  // Cierre automático de citas pasadas (negocios con autoCompleteEnabled)
  const { closed: autoClosed } = await closePastAppointments();
  // Degradar pruebas caducadas sin suscripción a plan free
  const { degraded: trialsDegraded } = await degradeExpiredTrials();
  // Mantenimiento oportunista: purga ventanas viejas del rate limiting.
  await cleanupRateLimitCounters();
  return NextResponse.json({ ...result, autoClosed, trialsDegraded });
}

export const POST = handleCron;
export const GET = handleCron;
