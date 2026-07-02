import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis citas" };

export default async function MyAppointmentsPage() {
  const user = await requireUser();

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });

  const appointments = await prisma.appointment.findMany({
    where: { clientId: user.id },
    include: {
      service: { select: { name: true, durationMinutes: true } },
      staff: { select: { name: true } },
      business: {
        select: {
          name: true,
          slug: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
        },
      },
    },
    orderBy: { startAt: "desc" },
    take: 100,
  });

  const now = Date.now();
  const upcoming = appointments
    .filter((a) => a.status === "CONFIRMED" && a.startAt.getTime() > now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const past = appointments.filter(
    (a) => !(a.status === "CONFIRMED" && a.startAt.getTime() > now),
  );

  function formatDate(date: Date, timezone: string) {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {account && !account.emailVerifiedAt && (
          <VerifyEmailBanner email={user.email} />
        )}
        <h1 className="text-2xl font-bold text-slate-900">Mis citas</h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Próximas</h2>
          <div className="mt-4 space-y-4">
            {upcoming.map((a) => (
              <div key={a.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {a.service.name}{" "}
                      <span className="text-slate-400">·</span>{" "}
                      <Link
                        href={`/b/${a.business.slug}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {a.business.name}
                      </Link>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDate(a.startAt, a.business.timezone)} ·{" "}
                      {a.service.durationMinutes} min
                      {a.staff ? ` · con ${a.staff.name}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {formatCents(a.priceCents, a.business.currency)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-4">
                  <CancelAppointmentButton
                    appointmentId={a.id}
                    startAt={a.startAt.toISOString()}
                    windowHours={a.business.cancellationWindowHours}
                    feePercent={a.business.lateCancellationFeePercent}
                    priceCents={a.priceCents}
                    currency={a.business.currency}
                  />
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-slate-500">
                No tienes citas próximas.{" "}
                <Link href="/" className="text-indigo-600">
                  Reserva una
                </Link>
                .
              </p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">Historial</h2>
          <div className="mt-4 space-y-3">
            {past.map((a) => (
              <div
                key={a.id}
                className="card flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {a.service.name}{" "}
                    <span className="text-slate-400">·</span> {a.business.name}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {formatDate(a.startAt, a.business.timezone)}
                  </p>
                  {a.chargedCents > 0 && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Importe cobrado:{" "}
                      {formatCents(a.chargedCents, a.business.currency)}
                    </p>
                  )}
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
            {past.length === 0 && (
              <p className="text-sm text-slate-500">Aún no hay historial.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
