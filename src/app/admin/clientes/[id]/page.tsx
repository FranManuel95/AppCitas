import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  UserX,
  Wallet,
} from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getClientDetail } from "@/lib/domain/clients";
import { DomainError } from "@/lib/domain/errors";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ClientNotes } from "@/components/admin/client-notes";
import { AnonymizeClientButton } from "@/components/admin/anonymize-client-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de cliente" };

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

function Metric({
  icon: Icon,
  label,
  value,
  tone = "text-ink",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}

// Ficha CRM: historial completo del cliente en ESTE negocio, métricas de
// fiabilidad y notas privadas del equipo.
export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getClientDetail>>;
  try {
    detail = await getClientDetail(admin.businessId, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "CLIENT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { currency: true },
  });
  const { client, metrics, appointments, notes } = detail;

  const reliability =
    metrics.reliabilityPercent === null
      ? "—"
      : `${metrics.reliabilityPercent}%`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {client.name}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {[client.email, client.phone].filter(Boolean).join(" · ")}
        </p>
        {/* Derecho al olvido solo para sombras (mostrador/invitado); los
            clientes con cuenta lo hacen ellos mismos desde "Mis datos". */}
        {client.guest && (
          <div className="mt-3">
            <AnonymizeClientButton clientId={client.id} />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={CalendarCheck}
          label="Citas completadas"
          value={`${metrics.completed} / ${metrics.totalAppointments}`}
        />
        <Metric
          icon={UserX}
          label="No presentado"
          value={String(metrics.noShows)}
          tone={metrics.noShows > 0 ? "text-danger-strong" : "text-ink"}
        />
        <Metric
          icon={Wallet}
          label="Gasto total"
          value={formatCents(metrics.spentCents, business.currency)}
        />
        <Metric icon={CalendarClock} label="Fiabilidad" value={reliability} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            Historial de citas
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{a.service.name}</p>
                  <p className="text-xs tabular-nums text-ink-muted">
                    {dateFmt.format(a.startAt)}
                    {a.staff ? ` · ${a.staff.name}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {a.chargedCents > 0 && (
                    <span className="tabular-nums text-ink-soft">
                      {formatCents(a.chargedCents, business.currency)}
                    </span>
                  )}
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <ClientNotes
          clientId={client.id}
          notes={notes.map((n) => ({
            id: n.id,
            text: n.text,
            authorName: n.authorName,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
