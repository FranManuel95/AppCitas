import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";

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
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              {t.landing.heroTitle}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              {t.landing.heroSubtitle}
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <a href="#negocios" className="btn-primary">
                {t.landing.findBusiness}
              </a>
              <Link href="/register-business" className="btn-secondary">
                {t.landing.imABusiness}
              </Link>
            </div>
          </div>
        </section>

        <section id="negocios" className="mx-auto w-full max-w-5xl px-4 py-12">
          <h2 className="text-xl font-semibold text-slate-900">
            {t.landing.businessesTitle}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {businesses.map((b) => (
              <Link
                key={b.id}
                href={`/b/${b.slug}`}
                className="card transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{b.name}</h3>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {b.category}
                  </span>
                </div>
                {b.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {b.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-400">
                  {b._count.services} {t.landing.services}
                  {b.address ? ` · ${b.address}` : ""}
                </p>
              </Link>
            ))}
            {businesses.length === 0 && (
              <p className="text-sm text-slate-500">
                {t.landing.noBusinesses}{" "}
                <Link href="/register-business" className="text-indigo-600">
                  {t.landing.beFirst}
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      </main>
      <footer className="space-y-2 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>{t.landing.footer}</p>
        <p className="space-x-3">
          <Link href="/legal/privacidad" className="hover:text-slate-600">
            {t.landing.legalPrivacy}
          </Link>
          <Link href="/legal/terminos" className="hover:text-slate-600">
            {t.landing.legalTerms}
          </Link>
          <Link href="/legal/aviso" className="hover:text-slate-600">
            {t.landing.legalNotice}
          </Link>
        </p>
      </footer>
    </>
  );
}
