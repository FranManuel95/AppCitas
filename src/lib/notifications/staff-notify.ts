import { prisma } from "@/lib/prisma";
import { intlLocale, type Locale } from "@/lib/i18n/shared";

// Avisos internos al equipo: cuando entra una nueva reserva o se cancela una
// cita, el empleado asignado (o el propio negocio si la cita no lleva empleado)
// recibe un aviso por el mismo outbox que usan los mensajes al cliente. El
// texto es fijo y bilingüe (no lo redacta el negocio, a diferencia de las
// plantillas de cliente). Todo best-effort: nunca rompe la reserva/cancelación.

export type StaffEvent = "STAFF_BOOKING" | "STAFF_CANCELLED";

function formatDateTime(date: Date, timezone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function staffMessage(
  event: StaffEvent,
  locale: Locale,
  vars: { clientName: string; serviceName: string; when: string },
): { subject: string; body: string } {
  const { clientName, serviceName, when } = vars;
  if (event === "STAFF_BOOKING") {
    return locale === "en"
      ? {
          subject: `New booking: ${serviceName} · ${when}`,
          body: `${clientName} booked ${serviceName} for ${when}.`,
        }
      : {
          subject: `Nueva reserva: ${serviceName} · ${when}`,
          body: `${clientName} ha reservado ${serviceName} para el ${when}.`,
        };
  }
  return locale === "en"
    ? {
        subject: `Booking cancelled: ${serviceName} · ${when}`,
        body: `${clientName} cancelled their ${serviceName} appointment on ${when}.`,
      }
    : {
        subject: `Cita cancelada: ${serviceName} · ${when}`,
        body: `${clientName} ha cancelado su cita de ${serviceName} del ${when}.`,
      };
}

// Encola el aviso interno del evento para el empleado asignado (email + push
// web si tiene cuenta) o, en su defecto, para el email del negocio.
export async function enqueueStaffEventNotification(
  appointmentId: string,
  event: StaffEvent,
  now = new Date(),
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      businessId: true,
      startAt: true,
      client: { select: { name: true } },
      service: { select: { name: true } },
      staff: {
        select: {
          email: true,
          user: {
            select: {
              id: true,
              locale: true,
              pushSubscriptions: { select: { id: true }, take: 1 },
            },
          },
        },
      },
      business: {
        select: { name: true, email: true, timezone: true, notifyStaffEvents: true },
      },
    },
  });
  if (!appointment || !appointment.business.notifyStaffEvents) return;

  const staff = appointment.staff;
  const locale: Locale = staff?.user?.locale === "en" ? "en" : "es";
  const when = formatDateTime(
    appointment.startAt,
    appointment.business.timezone,
    locale,
  );
  const { subject, body } = staffMessage(event, locale, {
    clientName: appointment.client.name,
    serviceName: appointment.service.name,
    when,
  });

  // Destinatarios: empleado asignado (email + push si tiene cuenta). Si no hay
  // empleado o no tiene contacto, cae al email del negocio para no perder el
  // aviso.
  const deliveries: Array<{ channel: string; recipient: string }> = [];
  if (staff) {
    if (staff.email) deliveries.push({ channel: "EMAIL", recipient: staff.email });
    if (staff.user && staff.user.pushSubscriptions.length > 0) {
      deliveries.push({ channel: "WEBPUSH", recipient: staff.user.id });
    }
  }
  if (deliveries.length === 0 && appointment.business.email) {
    deliveries.push({ channel: "EMAIL", recipient: appointment.business.email });
  }
  if (deliveries.length === 0) return;

  await prisma.notification.createMany({
    data: deliveries.map((d) => ({
      businessId: appointment.businessId,
      appointmentId: appointment.id,
      channel: d.channel,
      template: event,
      recipient: d.recipient,
      subject,
      body,
      scheduledFor: now,
    })),
  });
}
