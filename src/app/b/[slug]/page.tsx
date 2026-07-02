import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, Phone, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { fmt, getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { PackagesSection } from "@/components/packages-section";
import { formatCents } from "@/lib/money";
import { weekdayNames, WEEKDAY_ORDER } from "@/lib/weekdays";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await prisma.business.findFirst({
    where: { slug, active: true },
    select: { name: true, description: true },
  });
  if (!business) return {};
  const description = business.description ?? undefined;
  return {
    title: business.name,
    description,
    openGraph: {
      title: business.name,
      description,
      type: "website",
    },
  };
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { locale, t } = await getDict();
  const [business, user] = await Promise.all([
    prisma.business.findFirst({
      where: { slug, active: true },
      include: {
        services: { where: { active: true }, orderBy: { priceCents: "asc" } },
        hours: { orderBy: { openTime: "asc" } },
        staff: {
          where: { active: true },
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
        packages: {
          where: { active: true, service: { active: true } },
          include: { service: { select: { name: true, priceCents: true } } },
          orderBy: { priceCents: "asc" },
        },
      },
    }),
    getSessionUser(),
  ]);
  if (!business) notFound();

  const hoursByDay = WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    ranges: business.hours.filter((h) => h.weekday === weekday),
  }));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="bg-gradient-to-b from-brand-50 to-transparent">
          <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <Avatar
                  name={business.name}
                  size="lg"
                  className="mt-1 ring-4 ring-surface"
                />
                <div className="min-w-0">
                  <Badge tone="brand">{business.category}</Badge>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                    {business.name}
                  </h1>
                  {business.description && (
                    <p className="mt-2 max-w-2xl text-ink-soft">
                      {business.description}
                    </p>
                  )}
                  {(business.address || business.phone) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
                      {business.address && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                          {business.address}
                        </span>
                      )}
                      {business.phone && (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="h-4 w-4 shrink-0" aria-hidden />
                          {business.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Link
                href={`/b/${business.slug}/reservar`}
                className={buttonClasses({ size: "lg" })}
              >
                {t.business.bookAppointment}
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-2">
          <div className="grid gap-8 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <SectionHeader title={t.business.services} />
              <div className="mt-4 space-y-3">
                {business.services.map((s) => (
                  <Card
                    key={s.id}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h3 className="font-medium text-ink">{s.name}</h3>
                      {s.description && (
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {s.description}
                        </p>
                      )}
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {s.durationMinutes} {t.business.minutes}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-base font-semibold text-ink">
                        {formatCents(s.priceCents, business.currency)}
                      </span>
                      <Link
                        href={`/b/${business.slug}/reservar?servicio=${s.id}`}
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        {t.business.book}
                      </Link>
                    </div>
                  </Card>
                ))}
                {business.services.length === 0 && (
                  <p className="text-sm text-ink-muted">
                    {t.business.noServices}
                  </p>
                )}
              </div>
            </section>

            <aside className="space-y-6">
              <PackagesSection
                packages={business.packages.map((p) => ({
                  id: p.id,
                  name: p.name,
                  serviceName: p.service.name,
                  sessions: p.sessions,
                  priceCents: p.priceCents,
                  fullPriceCents: p.sessions * p.service.priceCents,
                  validityDays: p.validityDays,
                }))}
                currency={business.currency}
                isLoggedIn={!!user}
                slug={business.slug}
                t={t.business}
              />

              {business.staff.length > 0 && (
                <Card>
                  <h2 className="font-semibold tracking-tight text-ink">
                    {t.business.team}
                  </h2>
                  <ul className="mt-3 space-y-2.5">
                    {business.staff.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <Avatar name={m.name} size="sm" />
                        <span className="text-ink-soft">{m.name}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card>
                <h2 className="flex items-center gap-2 font-semibold tracking-tight text-ink">
                  <CalendarDays
                    className="h-4 w-4 shrink-0 text-ink-muted"
                    aria-hidden
                  />
                  {t.business.schedule}
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {hoursByDay.map(({ weekday, ranges }) => (
                    <li key={weekday} className="flex justify-between gap-4">
                      <span className="text-ink-muted">
                        {weekdayNames(locale)[weekday]}
                      </span>
                      <span className="text-right text-ink-soft tabular-nums">
                        {ranges.length > 0
                          ? ranges
                              .map((r) => `${r.openTime}–${r.closeTime}`)
                              .join(", ")
                          : t.business.closed}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="border-warning/25 bg-warning-soft">
                <h2 className="flex items-center gap-2 font-semibold tracking-tight text-warning-strong">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                  {t.business.policyTitle}
                </h2>
                <p className="mt-2 text-sm text-warning-strong">
                  {fmt(t.business.policyText, {
                    hours: business.cancellationWindowHours,
                    percent: business.lateCancellationFeePercent,
                  })}
                </p>
              </Card>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
