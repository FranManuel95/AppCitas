import { NextResponse } from "next/server";
import { processDueNotifications } from "@/lib/notifications/service";
import { closePastAppointments } from "@/lib/domain/auto-close";
import { cleanupRateLimitCounters } from "@/lib/rate-limit";
import { degradeExpiredTrials } from "@/lib/domain/plans";
import { purgeExpiredData } from "@/lib/domain/retention";
import { issuePendingInvoices } from "@/lib/domain/invoices";
import {
  expireStaleWaitlist,
  recycleNotifiedWaitlist,
} from "@/lib/domain/waitlist";

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
  // Retención: purga logs de auditoría y eventos de webhook caducados (>90 d).
  const purged = await purgeExpiredData();
  // Lista de espera: borra las entradas de días pasados y recicla los avisos no
  // aprovechados para que la siguiente cancelación los vuelva a avisar.
  const { expired: waitlistExpired } = await expireStaleWaitlist();
  const { recycled: waitlistRecycled } = await recycleNotifiedWaitlist();
  // Facturación: reconcilia cobros recientes que quedaron sin factura
  // (p. ej. la app cayó entre el cobro y la emisión).
  const invoicesIssued = await issuePendingInvoices();
  return NextResponse.json({
    ...result,
    autoClosed,
    trialsDegraded,
    purged,
    waitlistExpired,
    waitlistRecycled,
    invoicesIssued,
  });
}

export const POST = handleCron;
export const GET = handleCron;
