import Link from "next/link";
import { BookUser, ChevronRight } from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getBusinessClients } from "@/lib/domain/clients";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { CsvImportCard } from "@/components/admin/csv-import-card";

const CLIENTS_TEMPLATE = `nombre;email;telefono;nacimiento
Marta García;marta@ejemplo.com;+34600111222;1990-05-14
Juan Pérez;;600333444;
Lucía Sanz;lucia@ejemplo.com;;`;

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

function reliabilityBadge(percent: number | null): {
  label: string;
  tone: BadgeTone;
} {
  if (percent === null) return { label: "Sin historial", tone: "neutral" };
  if (percent >= 90) return { label: `${percent}% fiable`, tone: "success" };
  if (percent >= 60) return { label: `${percent}% fiable`, tone: "warning" };
  return { label: `${percent}% fiable`, tone: "danger" };
}

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Cartera de clientes del negocio, derivada de sus citas, con métricas de
// fiabilidad y gasto. La ficha individual añade historial y notas privadas.
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const [clients, business] = await Promise.all([
    getBusinessClients(admin.businessId, query),
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { currency: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Clientes"
        description={
          query
            ? `${clients.length} resultado(s) para "${query}".`
            : clients.length === 0
              ? "Tu cartera de clientes se construye sola con cada reserva."
              : `${clients.length} cliente(s) con al menos una cita. Fiabilidad = citas a las que acudió frente a no presentados.`
        }
      />

      {(clients.length > 0 || query) && (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar clientes"
            className="min-w-56 flex-1"
          />
          <button type="submit" className={buttonClasses({ variant: "secondary" })}>
            Buscar
          </button>
        </form>
      )}

      {clients.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title={query ? "Sin resultados" : "Aún no hay clientes"}
          description={
            query
              ? `Ningún cliente coincide con "${query}".`
              : "Cuando alguien reserve su primera cita aparecerá aquí, con su historial y métricas."
          }
        />
      ) : (
        <div className="space-y-3">
          {clients.map((c) => {
            const badge = reliabilityBadge(c.reliabilityPercent);
            return (
              <Link
                key={c.clientId}
                href={`/admin/clientes/${c.clientId}`}
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:border-brand-300">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
                    <span className="tabular-nums">
                      {c.totalAppointments} citas
                    </span>
                    {c.noShows > 0 && (
                      <span className="tabular-nums text-danger-strong">
                        {c.noShows} no-show{c.noShows > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="tabular-nums">
                      {formatCents(c.spentCents, business.currency)}
                    </span>
                    {c.lastVisit && (
                      <span className="hidden text-xs text-ink-muted sm:inline">
                        última: {dateFmt.format(c.lastVisit)}
                      </span>
                    )}
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <ChevronRight
                      className="h-4 w-4 text-ink-muted"
                      aria-hidden
                    />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <CsvImportCard
        kind="clients"
        templateCsv={CLIENTS_TEMPLATE}
        templateName="plantilla-clientes.csv"
      />
    </div>
  );
}
