import Link from "next/link";
import {
  CalendarDays,
  CalendarX2,
  Clock,
  Star,
  Store,
  User,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { RescheduleAppointment } from "@/components/reschedule-appointment";
import { ReviewForm } from "@/components/review-form";
import { MyDataPanel } from "@/components/my-data-panel";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { fmt, getDict, intlLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

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
      review: { select: { rating: true } },
      business: {
        select: {
          name: true,
          slug: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
          maxAdvanceBookingDays: true,
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
      timeZone: timezone,
    }).format(date);
  }

  function formatTime(date: Date, timezone: string) {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  }

  function toDateISO(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {account && !account.emailVerifiedAt && (
          <VerifyEmailBanner
            email={user.email}
            labels={{
              text: fmt(t.verify.bannerText, { email: user.email }),
              resend: t.verify.resend,
              resending: t.verify.resending,
              resent: t.verify.resent,
              error: t.verify.resendError,
            }}
          />
        )}
        <SectionHeader as="h1" title={t.myAppointments.title} />

        <section className="mt-8">
          <SectionHeader as="h2" title={t.myAppointments.upcoming} />
          <div className="mt-4 space-y-4">
            {upcoming.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    href={`/b/${a.business.slug}`}
                    className="min-w-0 font-semibold text-ink transition-colors hover:text-brand-700"
                  >
                    {a.business.name}
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={a.status} />
                    <span className="text-sm font-semibold text-ink">
                      {formatCents(a.priceCents, a.business.currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-ink-soft">
                  <p className="flex items-center gap-2">
                    <CalendarDays
                      className="h-4 w-4 shrink-0 text-ink-muted"
                      aria-hidden
                    />
                    <span>{formatDate(a.startAt, a.business.timezone)}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock
                      className="h-4 w-4 shrink-0 text-ink-muted"
                      aria-hidden
                    />
                    <span>
                      {formatTime(a.startAt, a.business.timezone)}{" "}
                      <span className="text-ink-muted">
                        · {a.service.durationMinutes} min
                      </span>
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Store
                      className="h-4 w-4 shrink-0 text-ink-muted"
                      aria-hidden
                    />
                    <span>{a.service.name}</span>
                  </p>
                  {a.staff && (
                    <p className="flex items-center gap-2">
                      <User
                        className="h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      <span>
                        {fmt(t.myAppointments.withStaff, {
                          name: a.staff.name,
                        }).replace(/^\s*·\s*/, "")}
                      </span>
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-4">
                  {/* Reprogramar solo mientras dure la ventana de cancelación gratuita */}
                  {a.startAt.getTime() -
                    a.business.cancellationWindowHours * 3_600_000 >
                    now && (
                    <RescheduleAppointment
                      appointmentId={a.id}
                      businessSlug={a.business.slug}
                      serviceId={a.serviceId}
                      minDateISO={toDateISO(now)}
                      maxDateISO={toDateISO(
                        now + a.business.maxAdvanceBookingDays * 86_400_000,
                      )}
                      labels={t.myAppointments}
                    />
                  )}
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
              </Card>
            ))}
            {upcoming.length === 0 && (
              <EmptyState
                icon={CalendarX2}
                title={t.myAppointments.noUpcoming}
                action={
                  <Link
                    href="/"
                    className={buttonClasses({ variant: "primary", size: "sm" })}
                  >
                    {t.myAppointments.bookOne}
                  </Link>
                }
              />
            )}
          </div>
        </section>

        {myPackages.length > 0 && (
          <section className="mt-10">
            <SectionHeader as="h2" title={t.myAppointments.myPackages} />
            <div className="mt-4 space-y-3">
              {myPackages.map((p) => {
                const expired =
                  p.expiresAt && p.expiresAt.getTime() < Date.now();
                const usable = p.remainingSessions > 0 && !expired;
                return (
                  <Card
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {p.package.name}{" "}
                        <span className="text-ink-muted">·</span>{" "}
                        {p.business.name}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {p.package.service.name} ·{" "}
                        {formatCents(p.pricePaidCents, p.business.currency)}
                        {p.expiresAt
                          ? ` · ${fmt(t.myAppointments.expiresOn, { date: p.expiresAt.toLocaleDateString(intlLocale(locale)) })}`
                          : ""}
                        {p.paymentStatus === "UNCOLLECTED"
                          ? ` · ${t.myAppointments.pendingPayment}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={usable ? "success" : "neutral"}>
                      {expired
                        ? t.myAppointments.expired
                        : fmt(t.myAppointments.sessions, {
                            n: p.remainingSessions,
                          })}
                    </Badge>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-10">
          <SectionHeader as="h2" title={t.myAppointments.history} />
          <div className="mt-4 space-y-3">
            {past.map((a) => (
              <Card
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{a.business.name}</p>
                  <div className="mt-1.5 space-y-1 text-sm text-ink-soft">
                    <p className="flex items-center gap-2">
                      <Store
                        className="h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      <span>{a.service.name}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarDays
                        className="h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      <span>
                        {formatDate(a.startAt, a.business.timezone)}{" "}
                        <span className="text-ink-muted">
                          · {formatTime(a.startAt, a.business.timezone)}
                        </span>
                      </span>
                    </p>
                  </div>
                  {a.chargedCents > 0 && (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {fmt(t.myAppointments.chargedAmount, {
                        amount: formatCents(a.chargedCents, a.business.currency),
                      })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge status={a.status} />
                  {a.status === "COMPLETED" && a.review && (
                    <div className="flex items-center gap-2">
                      <Badge tone="brand" icon={Star}>
                        {t.myAppointments.reviewedBadge}
                      </Badge>
                      <span
                        className="flex items-center gap-0.5"
                        role="img"
                        aria-label={fmt(t.myAppointments.starAria, {
                          n: a.review.rating,
                        })}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={cn(
                              "h-3.5 w-3.5",
                              n <= a.review!.rating
                                ? "fill-current text-warning"
                                : "text-ink-muted",
                            )}
                            aria-hidden
                          />
                        ))}
                      </span>
                    </div>
                  )}
                </div>
                {a.status === "COMPLETED" && !a.review && (
                  <div className="w-full border-t border-border pt-3">
                    <ReviewForm appointmentId={a.id} labels={t.myAppointments} />
                  </div>
                )}
              </Card>
            ))}
            {past.length === 0 && (
              <EmptyState
                icon={CalendarDays}
                title={t.myAppointments.noHistory}
              />
            )}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader as="h2" title={t.myData.title} />
          <div className="mt-4">
            <MyDataPanel t={t.myData} />
          </div>
        </section>
      </main>
    </>
  );
}
