import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { formatCents } from "@/lib/money";
import { getDict, intlLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis citas" };

export default async function MyAppointmentsPage() {
  const user = await requireUser();
  const { locale, t } = await getDict();

  const [account, myPackages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerifiedAt: true },
    }),
    prisma.clientPackage.findMany({
      where: { clientId: user.id },
      include: {
        package: { select: { name: true, service: { select: { name: true } } } },
        business: { select: { name: true, slug: true, currency: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

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
    return new Intl.DateTimeFormat(intlLocale(locale), {
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
          <VerifyEmailBanner
            email={user.email}
            labels={{
              text: t.verify.bannerText(user.email),
              resend: t.verify.resend,
              resending: t.verify.resending,
              resent: t.verify.resent,
              error: t.verify.resendError,
            }}
          />
        )}
        <h1 className="text-2xl font-bold text-slate-900">
          {t.myAppointments.title}
        </h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">
            {t.myAppointments.upcoming}
          </h2>
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
                      {a.staff ? t.myAppointments.withStaff(a.staff.name) : ""}
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
                    t={t.myAppointments}
                  />
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-slate-500">
                {t.myAppointments.noUpcoming}{" "}
                <Link href="/" className="text-indigo-600">
                  {t.myAppointments.bookOne}
                </Link>
                .
              </p>
            )}
          </div>
        </section>

        {myPackages.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-slate-900">
              {t.myAppointments.myPackages}
            </h2>
            <div className="mt-4 space-y-3">
              {myPackages.map((p) => {
                const expired =
                  p.expiresAt && p.expiresAt.getTime() < Date.now();
                const usable = p.remainingSessions > 0 && !expired;
                return (
                  <div
                    key={p.id}
                    className="card flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {p.package.name}{" "}
                        <span className="text-slate-400">·</span>{" "}
                        {p.business.name}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {p.package.service.name} ·{" "}
                        {formatCents(p.pricePaidCents, p.business.currency)}
                        {p.expiresAt
                          ? ` · ${t.myAppointments.expiresOn(p.expiresAt.toLocaleDateString(intlLocale(locale)))}`
                          : ""}
                        {p.paymentStatus === "UNCOLLECTED"
                          ? ` · ${t.myAppointments.pendingPayment}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        usable
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {expired
                        ? t.myAppointments.expired
                        : t.myAppointments.sessions(p.remainingSessions)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {t.myAppointments.history}
          </h2>
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
                      {t.myAppointments.chargedAmount(
                        formatCents(a.chargedCents, a.business.currency),
                      )}
                    </p>
                  )}
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
            {past.length === 0 && (
              <p className="text-sm text-slate-500">
                {t.myAppointments.noHistory}
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
