import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import {
  deleteEvent,
  getAccessToken,
  upsertEvent,
} from "./google";

// Sincronización SALIENTE (citas → eventos de Google). Cada cambio encola un
// CalendarSyncJob por conexión destino y se intenta procesar EN LÍNEA; si
// falla queda PENDING y lo recoge el cron (claim atómico PENDING→SENDING,
// mismo patrón que el outbox de notificaciones). Best-effort SIEMPRE: un
// fallo de Google nunca rompe la reserva.

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60_000;

export type CalendarSyncAction = "UPSERT" | "DELETE";

/**
 * Encola la sincronización de una cita hacia las conexiones que la reflejan
 * (la del empleado asignado y la de nivel negocio) y procesa en línea.
 * Los llamadores del dominio ya tienen la cita a mano: pasando ctx se evita
 * volver a leerla solo para conocer negocio y empleado.
 */
export async function enqueueCalendarSync(
  appointmentId: string,
  action: CalendarSyncAction,
  now = new Date(),
  ctx?: { businessId: string; staffId: string | null },
): Promise<void> {
  try {
    const appointment =
      ctx ??
      (await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { businessId: true, staffId: true },
      }));
    if (!appointment) return;

    const connections = await prisma.calendarConnection.findMany({
      where: {
        businessId: appointment.businessId,
        syncOutbound: true,
        status: "active",
        OR: [
          { staffId: null },
          ...(appointment.staffId ? [{ staffId: appointment.staffId }] : []),
        ],
      },
      select: { id: true },
    });
    if (connections.length === 0) return;

    await prisma.calendarSyncJob.createMany({
      data: connections.map((c) => ({
        appointmentId,
        connectionId: c.id,
        action,
        scheduledFor: now,
      })),
    });
    // Intento inmediato: en el caso normal el evento aparece al momento
    await processCalendarSyncJobs(now, connections.length);
  } catch (error) {
    logError("calendar.enqueue.failed", error, { appointmentId, action });
  }
}

/**
 * Procesa los jobs vencidos del outbox. Lo invocan el intento en línea y el
 * cron (/api/jobs/notifications). Devuelve cuántos envió.
 */
export async function processCalendarSyncJobs(
  now = new Date(),
  limit = 25,
): Promise<{ sent: number; failed: number }> {
  const due = await prisma.calendarSyncJob.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  for (const job of due) {
    // Claim atómico: solo un proceso trabaja cada job
    const claim = await prisma.calendarSyncJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;

    try {
      await runJob(job.id);
      await prisma.calendarSyncJob.update({
        where: { id: job.id },
        data: { status: "SENT", attempts: job.attempts + 1 },
      });
      sent++;
    } catch (error) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await prisma.calendarSyncJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          lastError:
            error instanceof Error ? error.message.slice(0, 300) : "error",
          scheduledFor: exhausted
            ? job.scheduledFor
            : new Date(now.getTime() + RETRY_DELAY_MS * attempts),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}

async function runJob(jobId: string): Promise<void> {
  const job = await prisma.calendarSyncJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      connection: true,
      appointment: {
        include: {
          service: { select: { name: true } },
          client: { select: { name: true } },
          business: { select: { name: true, timezone: true, address: true } },
        },
      },
    },
  });
  const { connection, appointment } = job;

  const link = await prisma.calendarEventLink.findUnique({
    where: {
      appointmentId_connectionId: {
        appointmentId: appointment.id,
        connectionId: connection.id,
      },
    },
  });

  if (job.action === "DELETE") {
    if (!link) return; // nunca se creó el evento: nada que borrar
    if (connection.simulated) {
      console.log(
        `[calendar:dev] borrado simulado del evento ${link.googleEventId}`,
      );
    } else {
      const token = await getAccessToken(connection);
      await deleteEvent(token, connection.calendarId, link.googleEventId);
    }
    await prisma.calendarEventLink.delete({ where: { id: link.id } });
    await touchSynced(connection.id);
    return;
  }

  // UPSERT
  const payload = {
    summary: `${appointment.service.name} · ${appointment.client.name}`,
    description: `Cita de ${appointment.business.name} (AppCitas)`,
    location: appointment.business.address ?? undefined,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    timezone: appointment.business.timezone,
  };

  let eventId: string;
  if (connection.simulated) {
    eventId = link?.googleEventId ?? `dev_evt_${appointment.id.slice(-8)}`;
    console.log(
      `[calendar:dev] evento simulado ${eventId}: ${payload.summary} @ ${payload.startAt.toISOString()}`,
    );
  } else {
    const token = await getAccessToken(connection);
    eventId = await upsertEvent(
      token,
      connection.calendarId,
      link?.googleEventId ?? null,
      payload,
    );
  }

  await prisma.calendarEventLink.upsert({
    where: {
      appointmentId_connectionId: {
        appointmentId: appointment.id,
        connectionId: connection.id,
      },
    },
    create: {
      appointmentId: appointment.id,
      connectionId: connection.id,
      googleEventId: eventId,
    },
    update: { googleEventId: eventId },
  });
  await touchSynced(connection.id);
}

async function touchSynced(connectionId: string): Promise<void> {
  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: { lastSyncedAt: new Date() },
  });
}
