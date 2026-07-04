import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getBusinessReviewSummary } from "@/lib/domain/reviews";
import { fmt, getDict, intlLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { SiteHeader } from "@/components/site-header";
import { PackagesSection } from "@/components/packages-section";
import { formatCents } from "@/lib/money";
import { weekdayNames, WEEKDAY_ORDER } from "@/lib/weekdays";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

// La página sigue siendo dinámica (usa cookies para sesión e idioma), pero el
// árbol de datos público del negocio —lo caro (servicios, horario, equipo,
// bonos, reseñas)— se sirve desde caché de datos con revalidación a 60 s. Así
// los hits de una página de negocio popular no consultan la BD en cada visita;
// una edición del negocio tarda ≤60 s en reflejarse (mismo criterio que la
// landing). La invalidación instantánea por tag queda pendiente hasta que la
// API de caché de Next 16 (revalidateTag/updateTag) se estabilice.
export const dynamic = "force-dynamic";
const REVALIDATE_SECONDS = 60;

// Datos públicos del negocio (nada dependiente del usuario), cacheados por slug.
function getPublicBusinessData(slug: string) {
  return unstable_cache(
    async () => {
      const business = await prisma.business.findFirst({
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
      });
      if (!business) return null;

      const [reviewSummary, reviews] = await Promise.all([
        getBusinessReviewSummary(business.id),
        prisma.review.findMany({
          where: { businessId: business.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            client: { select: { name: true } },
          },
        }),
      ]);
      return { business, reviewSummary, reviews };
    },
    ["public-business", slug],
    { revalidate: REVALIDATE_SECONDS },
  )();
}

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
  const [data, user] = await Promise.all([
    getPublicBusinessData(slug),
    getSessionUser(),
  ]);
  if (!data) notFound();
  const { business, reviewSummary, reviews } = data;

  const ratingAverage = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(reviewSummary.average);
  const reviewDate = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "short",
  });

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
                  {reviewSummary.count > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm">
                      <Star
                        className="h-4 w-4 shrink-0 fill-current text-warning"
                        aria-hidden
                      />
                      <span className="font-semibold text-ink">
                        {ratingAverage}
                      </span>
                      <span className="text-ink-muted">
                        ·{" "}
                        {reviewSummary.count === 1
                          ? t.business.reviewsOne
                          : fmt(t.business.reviewsCount, {
                              count: reviewSummary.count,
                            })}
                      </span>
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

              {reviews.length > 0 && (
                <Card className="mt-8">
                  <SectionHeader title={t.business.reviewsTitle} as="h2" />
                  <ul className="mt-4 space-y-4">
                    {reviews.map((r) => (
                      <li
                        key={r.id}
                        className="border-t border-border pt-4 first:border-t-0 first:pt-0"
                      >
                        <span
                          className="flex items-center gap-0.5"
                          role="img"
                          aria-label={fmt(t.myAppointments.starAria, {
                            n: r.rating,
                          })}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={cn(
                                "h-4 w-4",
                                n <= r.rating
                                  ? "fill-current text-warning"
                                  : "text-ink-muted",
                              )}
                              aria-hidden
                            />
                          ))}
                        </span>
                        {r.comment && (
                          <p className="mt-1.5 text-sm text-ink-soft">
                            {r.comment}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-ink-muted">
                          {r.client.name.trim().split(/\s+/)[0]} ·{" "}
                          {reviewDate.format(r.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
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
