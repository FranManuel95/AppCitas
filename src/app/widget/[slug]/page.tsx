import { notFound } from "next/navigation";
import { CalendarDays, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { brandStyle } from "@/lib/branding";
import { formatCents } from "@/lib/money";
import { fmt, getDict } from "@/lib/i18n";

export const dynamic = "force-dynamic";
// Página pensada para incrustarse en la web del negocio: sin indexar
export const metadata = {
  title: "Reservar",
  robots: { index: false, follow: false },
};

// Widget embebible: tarjeta compacta con los servicios y un CTA que abre la
// página de reserva completa en la ventana padre (target=_top). Es la única
// ruta de la app que permite enmarcarse (ver src/proxy.ts).
export default async function WidgetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, { t }] = await Promise.all([params, getDict()]);
  const business = await prisma.business.findFirst({
    where: { slug, active: true },
    select: {
      name: true,
      slug: true,
      category: true,
      brandColor: true,
      logoUrl: true,
      currency: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
        orderBy: { priceCents: "asc" },
      },
    },
  });
  if (!business) notFound();

  const visible = business.services.slice(0, 4);
  const remaining = business.services.length - visible.length;

  return (
    <main
      className="flex min-h-screen items-start justify-center bg-transparent p-2"
      style={brandStyle(business.brandColor)}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-ink">
              {business.name}
            </p>
            {business.category && (
              <p className="truncate text-xs text-ink-muted">
                {business.category}
              </p>
            )}
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {visible.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-ink">{s.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-ink-soft">
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <Clock className="h-3 w-3" aria-hidden />
                  {s.durationMinutes}&#8217;
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatCents(s.priceCents, business.currency)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {remaining > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            {fmt(t.widget.moreServices, { n: remaining })}
          </p>
        )}

        {/* target=_top: el CTA navega la página del negocio, no el iframe */}
        <a
          href={`/b/${business.slug}/reservar`}
          target="_top"
          className="btn-primary mt-4 w-full"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          {t.widget.bookCta}
        </a>

        <p className="mt-3 text-center text-[11px] text-ink-muted">
          {t.widget.poweredBy}
        </p>
      </div>
    </main>
  );
}
