import Link from "next/link";
import { Download, FileText, Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { formatCents } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { BackfillInvoicesButton } from "@/components/admin/backfill-invoices-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

// Libro de facturas del negocio: numeración correlativa por año, con las
// rectificativas en negativo. La emisión es automática al registrar cobros;
// aquí se consulta, exporta y (si procede) se completa el año al activar.
export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();

  const [business, invoices, years] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { invoicingEnabled: true, currency: true, taxId: true },
    }),
    prisma.invoice.findMany({
      where: { businessId: admin.businessId, year },
      orderBy: [{ issuedAt: "desc" }],
      take: 1000,
    }),
    prisma.invoice.findMany({
      where: { businessId: admin.businessId },
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" });
  const totalCents = invoices
    .filter((i) => i.status === "ISSUED" || i.totalCents < 0)
    .reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          as="h1"
          title="Facturas"
          description="Numeración correlativa por año. Se emiten solas al registrar un cobro; las reversiones generan rectificativas."
        />
        {invoices.length > 0 && (
          <a
            href={`/api/admin/invoices?year=${year}&format=csv`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-3"
          >
            <Download className="h-4 w-4" aria-hidden />
            Exportar CSV
          </a>
        )}
      </div>

      {!business.invoicingEnabled && (
        <Card className="border-warning/40 bg-warning-soft">
          <p className="text-sm font-medium text-warning-strong">
            La facturación está desactivada
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Actívala en Ajustes (necesitas el NIF/CIF relleno) y cada cobro
            emitirá su factura automáticamente.
          </p>
          <Link
            href="/admin/ajustes"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Ir a Ajustes
          </Link>
        </Card>
      )}

      {business.invoicingEnabled && (
        <BackfillInvoicesButton />
      )}

      {years.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <Link
              key={y.year}
              href={`/admin/facturas?year=${y.year}`}
              className={
                y.year === year
                  ? "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-3"
              }
            >
              {y.year}
            </Link>
          ))}
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={`Sin facturas en ${year}.`}
          description="Se emiten automáticamente al completar citas con cobro (o al cobrarse un no-show)."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Número</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Concepto</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/factura/${i.id}`}
                      className="font-medium tabular-nums text-brand-700 hover:underline"
                    >
                      {i.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-soft">
                    {dateFmt.format(i.issuedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{i.clientName}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-ink-soft">
                    {i.concept}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      i.totalCents < 0 ? "text-danger-strong" : "text-ink"
                    }`}
                  >
                    {formatCents(i.totalCents, i.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.status === "RECTIFIED" ? (
                      <Badge tone="neutral">Rectificada</Badge>
                    ) : i.series === "R" ? (
                      <Badge tone="warning">Rectificativa</Badge>
                    ) : (
                      <Badge tone="success">Emitida</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong">
                <td colSpan={4} className="px-4 py-2.5 font-semibold text-ink">
                  Total facturado {year}
                </td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-ink">
                  {formatCents(totalCents, business.currency)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
