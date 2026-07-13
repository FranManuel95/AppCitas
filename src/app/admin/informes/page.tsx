import { Download } from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import {
  getOccupancyHeatmap,
  getPromotionsReport,
  getRetentionCohorts,
  getServiceReport,
  resolveReportRange,
} from "@/lib/domain/reports";
import { SERIES_PRIMARY } from "@/lib/design/tokens";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { RetentionChart } from "@/components/admin/reports-charts-lazy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Informes" };

// Orden de columnas del mapa de calor: lunes a domingo
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"]; // índice = getUTCDay

function csvHref(tipo: string, fromISO: string, toISO: string): string {
  return `/api/admin/reports?tipo=${tipo}&desde=${fromISO}&hasta=${toISO}`;
}

function CsvLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      CSV
    </a>
  );
}

// Informes avanzados: retención por cohortes, ventas por servicio, rendimiento
// de promociones y mapa de calor de ocupación. El rango de fechas viene por
// URL (?desde&hasta) y se aplica con un formulario GET sin JavaScript.
export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const params = await searchParams;
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { timezone: true, currency: true },
  });
  const range = resolveReportRange(params.desde, params.hasta, business.timezone);

  const [cohorts, services, promos, heatmap] = await Promise.all([
    getRetentionCohorts(admin.businessId),
    getServiceReport(admin.businessId, range),
    getPromotionsReport(admin.businessId, range),
    getOccupancyHeatmap(admin.businessId, range),
  ]);

  // Filas del mapa de calor: solo la franja horaria con actividad
  const hoursWithData = heatmap.cells.map((c) => c.hour);
  const hourStart = hoursWithData.length > 0 ? Math.min(...hoursWithData) : 9;
  const hourEnd = hoursWithData.length > 0 ? Math.max(...hoursWithData) : 20;
  const countAt = new Map(
    heatmap.cells.map((c) => [`${c.weekday}:${c.hour}`, c.count]),
  );

  const currency = business.currency;

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Informes"
        description="Retención de clientes, ventas por servicio, promociones y ocupación. Cada tabla se exporta a CSV."
      />

      {/* Rango de fechas (aplica a servicios, promociones y ocupación) */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink-soft">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={range.fromISO}
            className="input mt-1 block text-sm"
          />
        </label>
        <label className="text-sm text-ink-soft">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={range.toISO}
            className="input mt-1 block text-sm"
          />
        </label>
        <button type="submit" className="btn-secondary text-sm">
          Aplicar
        </button>
      </form>

      {/* ── Retención por cohortes ── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionHeader
            as="h2"
            title="Retención de clientes"
            description="Por mes de primera visita: % que volvió en los 90 días siguientes (histórico completo, no depende del rango)."
          />
          <CsvLink href={csvHref("cohortes", range.fromISO, range.toISO)} />
        </div>
        {cohorts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Aún no hay visitas completadas: la retención aparecerá con las
            primeras citas completadas.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <RetentionChart cohorts={cohorts.slice(-12)} />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-4 font-medium">Mes 1ª visita</th>
                    <th className="py-2 pr-4 font-medium">Clientes nuevos</th>
                    <th className="py-2 pr-4 font-medium">Repitieron</th>
                    <th className="py-2 pr-4 font-medium">% retención</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.slice(-12).map((c) => (
                    <tr key={c.month} className="border-b border-border last:border-0 text-ink-soft">
                      <td className="py-2 pr-4">{c.month}</td>
                      <td className="py-2 pr-4">{c.newClients}</td>
                      <td className="py-2 pr-4">{c.returned}</td>
                      <td className="py-2 pr-4">
                        {c.retentionPercent !== null ? `${c.retentionPercent}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ── Ventas por servicio ── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionHeader
            as="h2"
            title="Ventas por servicio"
            description="Todas las citas del rango, con ingresos cobrados y tasa de no-show."
          />
          <CsvLink href={csvHref("servicios", range.fromISO, range.toISO)} />
        </div>
        {services.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Sin citas en el rango elegido.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Servicio</th>
                  <th className="py-2 pr-4 font-medium">Citas</th>
                  <th className="py-2 pr-4 font-medium">Completadas</th>
                  <th className="py-2 pr-4 font-medium">No-show</th>
                  <th className="py-2 pr-4 font-medium">Ingresos</th>
                  <th className="py-2 pr-4 font-medium">Ticket medio</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.serviceId} className="border-b border-border last:border-0 text-ink-soft">
                    <td className="py-2 pr-4 font-medium text-ink">{s.name}</td>
                    <td className="py-2 pr-4">{s.total}</td>
                    <td className="py-2 pr-4">{s.completed}</td>
                    <td className="py-2 pr-4">
                      {s.noShows}
                      {s.noShowPercent !== null && s.noShows > 0 && (
                        <span className="text-xs text-ink-muted"> ({s.noShowPercent}%)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{formatCents(s.revenueCents, currency)}</td>
                    <td className="py-2 pr-4">
                      {s.avgTicketCents !== null
                        ? formatCents(s.avgTicketCents, currency)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Promociones ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeader
              as="h2"
              title="Cupones"
              description="Usos y descuento concedido en el rango."
            />
            <CsvLink href={csvHref("cupones", range.fromISO, range.toISO)} />
          </div>
          {promos.coupons.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No hay cupones creados.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-4 font-medium">Cupón</th>
                    <th className="py-2 pr-4 font-medium">Usos</th>
                    <th className="py-2 pr-4 font-medium">Descuento</th>
                    <th className="py-2 pr-4 font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.coupons.map((c) => (
                    <tr key={c.couponId} className="border-b border-border last:border-0 text-ink-soft">
                      <td className="py-2 pr-4 font-medium text-ink">
                        {c.code}
                        {!c.active && (
                          <span className="ml-1.5 text-xs text-ink-muted">(inactivo)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{c.uses}</td>
                      <td className="py-2 pr-4">{formatCents(c.discountCents, currency)}</td>
                      <td className="py-2 pr-4">{formatCents(c.revenueCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeader
              as="h2"
              title="Bonos"
              description="Vendidos en el rango y sesiones consumidas."
            />
            <CsvLink href={csvHref("bonos", range.fromISO, range.toISO)} />
          </div>
          {promos.packages.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No hay bonos creados.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-4 font-medium">Bono</th>
                    <th className="py-2 pr-4 font-medium">Vendidos</th>
                    <th className="py-2 pr-4 font-medium">Ingresos</th>
                    <th className="py-2 pr-4 font-medium">Sesiones</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.packages.map((p) => (
                    <tr key={p.packageId} className="border-b border-border last:border-0 text-ink-soft">
                      <td className="py-2 pr-4 font-medium text-ink">
                        {p.name}
                        {!p.active && (
                          <span className="ml-1.5 text-xs text-ink-muted">(inactivo)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{p.sold}</td>
                      <td className="py-2 pr-4">{formatCents(p.revenueCents, currency)}</td>
                      <td className="py-2 pr-4">
                        {p.sessionsUsed}/{p.sessionsTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Mapa de calor de ocupación ── */}
      <Card>
        <SectionHeader
          as="h2"
          title="Ocupación por día y hora"
          description="Citas confirmadas o completadas del rango, por día de la semana y hora local. Cuanto más oscuro, más citas."
        />
        {heatmap.cells.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Sin citas en el rango elegido.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="text-xs tabular-nums">
              <thead>
                <tr>
                  <th className="w-12 pr-2 text-right font-medium text-ink-muted">Hora</th>
                  {WEEKDAY_ORDER.map((wd) => (
                    <th key={wd} className="w-10 pb-1 text-center font-medium text-ink-muted">
                      {WEEKDAY_LABELS[wd]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: hourEnd - hourStart + 1 },
                  (_, i) => hourStart + i,
                ).map((hour) => (
                  <tr key={hour}>
                    <td className="pr-2 text-right text-ink-muted">{hour}:00</td>
                    {WEEKDAY_ORDER.map((wd) => {
                      const count = countAt.get(`${wd}:${hour}`) ?? 0;
                      const alpha = heatmap.max > 0 ? count / heatmap.max : 0;
                      return (
                        <td key={wd} className="p-0.5">
                          <div
                            className="flex h-7 w-10 items-center justify-center rounded"
                            style={{
                              backgroundColor:
                                count > 0
                                  ? `${SERIES_PRIMARY}${Math.round(
                                      (0.15 + 0.85 * alpha) * 255,
                                    )
                                      .toString(16)
                                      .padStart(2, "0")}`
                                  : "transparent",
                              color: alpha > 0.55 ? "#fff" : undefined,
                            }}
                            title={`${count} cita(s)`}
                          >
                            {count > 0 ? count : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
