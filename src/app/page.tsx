import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Search,
  SearchX,
  Star,
  Store,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";

export const dynamic = "force-dynamic";

// La landing es la página anónima más visitada: la vista SIN filtros (la
// portada típica) y la lista de categorías se sirven desde caché de datos con
// revalidación a 60 s, en vez de consultar la BD en cada hit. Las búsquedas
// con filtros siguen consultando en vivo (el espacio de términos no es
// cacheable). Un negocio recién dado de alta tarda ≤60 s en aparecer.
const REVALIDATE_SECONDS = 60;

// Búsqueda por nombre/descripción/dirección con LIKE '%término%'. En PostgreSQL
// la aceleran los índices GIN de trigramas (pg_trgm) de la migración 10, así que
// no hace un seq scan aunque haya miles de negocios; en SQLite dev es un LIKE
// normal. La query es idéntica en ambos proveedores (portable).
function businessListQuery(q: string, cat: string, searchTerms: string[]) {
  return prisma.business.findMany({
    where: {
      active: true,
      ...(cat ? { category: cat } : {}),
      ...(q
        ? {
            OR: searchTerms.flatMap((term) => [
              { name: { contains: term } },
              { description: { contains: term } },
              { address: { contains: term } },
            ]),
          }
        : {}),
    },
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
}

function reviewStatsQuery(businessIds: string[]) {
  if (businessIds.length === 0) return Promise.resolve([]);
  return prisma.review.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businessIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
}

const getCachedCategories = unstable_cache(
  () =>
    prisma.business.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ["landing-categories"],
  { revalidate: REVALIDATE_SECONDS },
);

const getCachedDefaultListing = unstable_cache(
  async () => {
    const businesses = await businessListQuery("", "", []);
    const reviewStats = await reviewStatsQuery(businesses.map((b) => b.id));
    return { businesses, reviewStats };
  },
  ["landing-default-listing"],
  { revalidate: REVALIDATE_SECONDS },
);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const { locale, t } = await getDict();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const cat = sp.cat?.trim() ?? "";
  const hasFilters = Boolean(q || cat);

  // En SQLite `contains` mapea a LIKE, insensible a mayúsculas solo en ASCII:
  // "MARÍA" no encuentra "maría". Buscamos con el término tal cual y en
  // minúsculas (deduplicado) para cubrir también los acentos en mayúscula.
  const searchTerms = Array.from(new Set([q, q.toLowerCase()]));

  const [categories, { businesses, reviewStats }] = await Promise.all([
    getCachedCategories(),
    hasFilters
      ? businessListQuery(q, cat, searchTerms).then(async (businesses) => ({
          businesses,
          reviewStats: await reviewStatsQuery(businesses.map((b) => b.id)),
        }))
      : getCachedDefaultListing(),
  ]);

  const ratingByBusiness = new Map(
    reviewStats.map((r) => [
      r.businessId,
      { avg: r._avg.rating ?? 0, count: r._count._all },
    ]),
  );

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
            <form
              action="/#negocios"
              method="get"
              className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
            >
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t.landing.searchPlaceholder}
                aria-label={t.landing.searchPlaceholder}
                className="flex-1"
              />
              <Select
                name="cat"
                defaultValue={cat}
                aria-label={t.landing.allCategories}
                className="sm:w-56"
              >
                <option value="">{t.landing.allCategories}</option>
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </Select>
              <button
                type="submit"
                className={buttonClasses({
                  variant: "primary",
                  className: "sm:shrink-0",
                })}
              >
                <Search className="h-4 w-4" aria-hidden />
                {t.landing.findBusiness}
              </button>
            </form>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
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
            {businesses.map((b) => {
              const stats = ratingByBusiness.get(b.id);
              return (
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
                        <span className="flex shrink-0 items-center gap-2">
                          {stats && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft">
                              <Star
                                className="h-3.5 w-3.5 text-warning"
                                fill="currentColor"
                                aria-hidden
                              />
                              {stats.avg.toLocaleString(locale, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              <span className="font-normal text-ink-muted">
                                ({stats.count})
                              </span>
                            </span>
                          )}
                          <Badge tone="brand">{b.category}</Badge>
                        </span>
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
              );
            })}
            {businesses.length === 0 &&
              (hasFilters ? (
                <EmptyState
                  icon={SearchX}
                  title={t.landing.searchNoResults}
                  description={t.landing.searchNoResultsHint}
                  className="sm:col-span-2"
                />
              ) : (
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
              ))}
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
