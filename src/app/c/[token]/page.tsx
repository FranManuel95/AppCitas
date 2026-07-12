import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Info,
  Link2Off,
  MapPin,
  Store,
  Tag,
  User,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { fmt, getDict, intlLocale } from "@/lib/i18n";
import { AttendanceForm } from "@/components/attendance-form";
import { ConfirmationCancelButton } from "@/components/confirmation-cancel-button";
import { RescheduleAppointment } from "@/components/reschedule-appointment";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmar asistencia" };

/* Mini-cabecera de marca: esta página pública no lleva el header global. */
function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
        <CalendarDays className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">
        AppCitas
      </span>
    </div>
  );
}

// Página pública enlazada desde el recordatorio (WhatsApp/SMS/email).
// El token único de la cita actúa como acceso: no requiere iniciar sesión.
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, { locale, t }] = await Promise.all([params, getDict()]);
  const appointment = await prisma.appointment.findUnique({
    where: { confirmationToken: token },
    include: {
      service: { select: { name: true, durationMinutes: true } },
      staff: { select: { name: true } },
      client: { select: { name: true } },
      business: {
        select: {
          name: true,
          slug: true,
          address: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
          maxAdvanceBookingDays: true,
        },
      },
    },
  });

  if (!appointment) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-4 py-10">
        <div className="w-full max-w-md">
          <BrandMark />
          <Card className="mt-6 p-6 text-center sm:p-8">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
              <Link2Off className="h-5 w-5 text-danger-strong" aria-hidden />
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              {t.confirmation.invalidLink}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.confirmation.invalidLinkText}
            </p>
            <Link
              href="/"
              className={buttonClasses({ className: "mt-6 w-full sm:w-auto" })}
            >
              {t.confirmation.goToApp}
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  const dateStr = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "full",
    timeZone: appointment.business.timezone,
  }).format(appointment.startAt);
  const timeStr = new Intl.DateTimeFormat(intlLocale(locale), {
    timeStyle: "short",
    timeZone: appointment.business.timezone,
  }).format(appointment.startAt);

  const isActive =
    appointment.status === "CONFIRMED" &&
    appointment.startAt.getTime() > Date.now();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark />
        <Card className="mt-6 p-6">
          <p className="text-sm text-ink-muted">
            {fmt(t.confirmation.hello, { name: appointment.client.name })}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-ink">
            {fmt(t.confirmation.yourAppointment, {
              business: appointment.business.name,
            })}
          </h1>
          <div className="mt-3">
            <StatusBadge status={appointment.status} />
          </div>

          <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
            <div className="space-y-2.5 text-sm text-ink-soft">
              <p className="flex items-center gap-2.5">
                <Store className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="font-medium text-ink">
                  {appointment.business.name}
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Tag className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>{appointment.service.name}</span>
              </p>
              {appointment.staff && (
                <p className="flex items-center gap-2.5">
                  <User className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                  <span>{appointment.staff.name}</span>
                </p>
              )}
              <p className="flex items-center gap-2.5">
                <CalendarDays
                  className="h-4 w-4 shrink-0 text-ink-muted"
                  aria-hidden
                />
                <span className="inline-block first-letter:uppercase">
                  {dateStr}
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>{timeStr}</span>
              </p>
              {appointment.business.address && (
                <p className="flex items-start gap-2.5">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
                    aria-hidden
                  />
                  <span>{appointment.business.address}</span>
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-ink-muted">
                {t.confirmation.price}
              </span>
              <span className="text-base font-semibold text-ink">
                {formatCents(
                  appointment.priceCents,
                  appointment.business.currency,
                )}
              </span>
            </div>
          </div>

          <div className="mt-6">
            {isActive ? (
              <>
                <AttendanceForm
                  token={token}
                  startAt={appointment.startAt.toISOString()}
                  windowHours={appointment.business.cancellationWindowHours}
                  feePercent={appointment.business.lateCancellationFeePercent}
                  priceCents={appointment.priceCents}
                  currency={appointment.business.currency}
                  alreadyConfirmed={!!appointment.attendanceConfirmedAt}
                  t={t.confirmation}
                  tMy={t.myAppointments}
                />
                {/* Reprogramar solo dentro de la ventana gratuita (misma regla
                    que en "Mis citas"); fuera de plazo queda solo cancelar. */}
                {appointment.startAt.getTime() -
                  appointment.business.cancellationWindowHours * 3_600_000 >
                  Date.now() && (
                  <div className="mt-3">
                    <RescheduleAppointment
                      appointmentId={appointment.id}
                      businessSlug={appointment.business.slug}
                      serviceId={appointment.serviceId}
                      minDateISO={new Date().toISOString().slice(0, 10)}
                      maxDateISO={new Date(
                        Date.now() +
                          appointment.business.maxAdvanceBookingDays *
                            86_400_000,
                      )
                        .toISOString()
                        .slice(0, 10)}
                      labels={t.myAppointments}
                      endpoint={`/api/confirmations/${token}/reschedule`}
                    />
                  </div>
                )}
                <ConfirmationCancelButton
                  token={token}
                  startAt={appointment.startAt.toISOString()}
                  windowHours={appointment.business.cancellationWindowHours}
                  feePercent={appointment.business.lateCancellationFeePercent}
                  priceCents={appointment.priceCents}
                  currency={appointment.business.currency}
                  labels={{
                    cancelCta: t.confirmation.cancelCta,
                    cancelFree: t.confirmation.cancelFree,
                    cancelLate: t.confirmation.cancelLate,
                    cancelConfirm: t.confirmation.cancelConfirm,
                    cancelKeep: t.confirmation.cancelKeep,
                    cancelError: t.confirmation.cancelError,
                  }}
                />
              </>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl bg-surface-3 px-4 py-3.5 text-sm text-ink-soft">
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
                  aria-hidden
                />
                <p>
                  {appointment.startAt.getTime() <= Date.now() &&
                  appointment.status === "CONFIRMED"
                    ? t.confirmation.pastAppointment
                    : t.confirmation.inactiveAppointment}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
