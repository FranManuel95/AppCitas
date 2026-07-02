import Link from "next/link";
import { ArrowRight, MapPin, Search, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { t } = await getDict();
  const businesses = await prisma.business.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      address: true,
      _count: { select: { services: { where: { active: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-brand-50 via-surface to-surface">
          <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:py-24">
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              {t.landing.heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
              {t.landing.heroSubtitle}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#negocios"
                className={buttonClasses({ variant: "primary", size: "lg" })}
              >
                <Search className="h-4 w-4" aria-hidden />
                {t.landing.findBusiness}
              </a>
              <Link
                href="/register-business"
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                {t.landing.imABusiness}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="negocios"
          className="mx-auto w-full max-w-5xl scroll-mt-8 px-4 py-12 sm:py-16"
        >
          <SectionHeader title={t.landing.businessesTitle} />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {businesses.map((b) => (
              <Link
                key={b.id}
                href={`/b/${b.slug}`}
                className="group rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={b.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-semibold text-ink group-hover:text-brand-700">
                        {b.name}
                      </h3>
                      <Badge tone="brand" className="shrink-0">
                        {b.category}
                      </Badge>
                    </div>
                    {b.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                        {b.description}
                      </p>
                    )}
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <Store className="h-3.5 w-3.5" aria-hidden />
                        {b._count.services} {t.landing.services}
                      </span>
                      {b.address && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{b.address}</span>
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
            {businesses.length === 0 && (
              <p className="text-sm text-ink-muted sm:col-span-2">
                {t.landing.noBusinesses}{" "}
                <Link
                  href="/register-business"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {t.landing.beFirst}
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-center text-xs text-ink-muted">
          <p>{t.landing.footer}</p>
          <p className="space-x-4">
            <Link
              href="/legal/privacidad"
              className="transition-colors hover:text-ink"
            >
              {t.landing.legalPrivacy}
            </Link>
            <Link
              href="/legal/terminos"
              className="transition-colors hover:text-ink"
            >
              {t.landing.legalTerms}
            </Link>
            <Link
              href="/legal/aviso"
              className="transition-colors hover:text-ink"
            >
              {t.landing.legalNotice}
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
