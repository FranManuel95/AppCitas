import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { PackagesSection } from "@/components/packages-section";
import { formatCents } from "@/lib/money";
import { weekdayNames, WEEKDAY_ORDER } from "@/lib/weekdays";

export const dynamic = "force-dynamic";

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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {business.category}
            </span>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {business.name}
            </h1>
            {business.description && (
              <p className="mt-2 max-w-2xl text-slate-600">
                {business.description}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-400">
              {[business.address, business.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link href={`/b/${business.slug}/reservar`} className="btn-primary">
            {t.business.bookAppointment}
          </Link>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t.business.services}
            </h2>
            <div className="mt-4 space-y-3">
              {business.services.map((s) => (
                <div
                  key={s.id}
                  className="card flex items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="font-medium text-slate-900">{s.name}</h3>
                    {s.description && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {s.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {s.durationMinutes} {t.business.minutes}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-semibold text-slate-900">
                      {formatCents(s.priceCents, business.currency)}
                    </span>
                    <Link
                      href={`/b/${business.slug}/reservar?servicio=${s.id}`}
                      className="btn-secondary"
                    >
                      {t.business.book}
                    </Link>
                  </div>
                </div>
              ))}
              {business.services.length === 0 && (
                <p className="text-sm text-slate-500">
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
              <div className="card">
                <h2 className="font-semibold text-slate-900">
                  {t.business.team}
                </h2>
                <ul className="mt-3 space-y-2">
                  {business.staff.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ background: m.color }}
                        aria-hidden
                      >
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-slate-700">{m.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <h2 className="font-semibold text-slate-900">
                {t.business.schedule}
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {hoursByDay.map(({ weekday, ranges }) => (
                  <li key={weekday} className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      {weekdayNames(locale)[weekday]}
                    </span>
                    <span className="text-right text-slate-700">
                      {ranges.length > 0
                        ? ranges
                            .map((r) => `${r.openTime}–${r.closeTime}`)
                            .join(", ")
                        : t.business.closed}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card border-amber-200 bg-amber-50">
              <h2 className="font-semibold text-amber-900">
                {t.business.policyTitle}
              </h2>
              <p className="mt-2 text-sm text-amber-800">
                {t.business.policyText(
                  business.cancellationWindowHours,
                  business.lateCancellationFeePercent,
                )}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
