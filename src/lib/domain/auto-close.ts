import { prisma } from "@/lib/prisma";
import { setAppointmentStatus } from "./appointments";

// Margen tras el fin de la cita antes de cerrarla automáticamente: deja un
// día al negocio para registrar manualmente un NO_SHOW antes del autocierre.
const GRACE_MS = 24 * 3_600_000;

// Máximo de citas cerradas por pasada para no bloquear el cron/worker; las
// restantes se recogen en la siguiente ejecución.
const BATCH_SIZE = 200;

/**
 * Cierre automático de citas pasadas: marca COMPLETED las citas CONFIRMED
 * cuyo fin quedó hace más de 24 h, solo en negocios con autoCompleteEnabled.
 *
 * Elección de implementación: setAppointmentStatus no exige actor (recibe
 * { appointmentId, businessId, status }), así que se reutiliza tal cual y el
 * autocierre aplica EXACTAMENTE la misma contabilidad que el cierre manual
 * (COMPLETED ⇒ chargedCents = priceCents, sin cobro automático, cancelledAt
 * a null). Se invoca cita a cita porque el efecto depende de cada fila
 * (chargedCents proviene de su priceCents) y no cabe en un updateMany.
 */
export async function closePastAppointments(
  now = new Date(),
): Promise<{ closed: number }> {
  const cutoff = new Date(now.getTime() - GRACE_MS);

  const stale = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      endAt: { lt: cutoff },
      business: { autoCompleteEnabled: true },
    },
    select: { id: true, businessId: true },
    orderBy: { endAt: "asc" },
    take: BATCH_SIZE,
  });

  let closed = 0;
  for (const appointment of stale) {
    try {
      await setAppointmentStatus({
        appointmentId: appointment.id,
        businessId: appointment.businessId,
        status: "COMPLETED",
      });
      closed++;
    } catch (error) {
      // Una cita problemática no debe frenar el resto del lote; se
      // reintentará en la siguiente pasada del cron.
      console.error(
        `[auto-close] no se pudo cerrar la cita ${appointment.id}:`,
        error,
      );
    }
  }

  return { closed };
}
