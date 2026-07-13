import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { formatCents } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factura" };

// Factura fiscal imprimible. Se pinta desde el SNAPSHOT de la fila Invoice
// (no desde la cita ni el negocio actuales): lo emitido no cambia.
export default async function FacturaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, businessId: admin.businessId },
  });
  if (!invoice) notFound();

  // La F anulada enlaza a su rectificativa (y viceversa)
  const related = invoice.rectifiesId
    ? await prisma.invoice.findUnique({ where: { id: invoice.rectifiesId } })
    : await prisma.invoice.findFirst({
        where: { rectifiesId: invoice.id },
      });

  const dateFmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" });

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/admin/facturas"
          className="text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
        >
          ← Volver a facturas
        </Link>
        <PrintButton label="Imprimir" />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {invoice.businessName}
            </h1>
            {invoice.businessAddress && (
              <p className="text-sm text-ink-muted">{invoice.businessAddress}</p>
            )}
            {invoice.businessTaxId && (
              <p className="text-sm text-ink-muted">
                NIF/CIF: {invoice.businessTaxId}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tracking-widest text-ink">
              {invoice.series === "R" ? "FACTURA RECTIFICATIVA" : "FACTURA"}
            </p>
            <p className="text-base font-bold tabular-nums text-ink">
              {invoice.code}
            </p>
            <p className="text-xs tabular-nums text-ink-muted">
              {dateFmt.format(invoice.issuedAt)}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Cliente</dt>
            <dd className="text-right text-ink">
              {invoice.clientName}
              <span className="block text-xs text-ink-muted">
                {invoice.clientEmail}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Concepto</dt>
            <dd className="max-w-72 text-right text-ink">{invoice.concept}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-4">
          <table className="w-full text-sm">
            <tbody>
              {invoice.taxPercent > 0 && (
                <>
                  <tr>
                    <td className="py-1 text-ink-muted">Base imponible</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(invoice.baseCents, invoice.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-muted">
                      IVA ({invoice.taxPercent}%)
                    </td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(invoice.taxCents, invoice.currency)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t border-border-strong">
                <td className="py-2 font-semibold text-ink">Total</td>
                <td className="py-2 text-right text-lg font-bold tabular-nums text-ink">
                  {formatCents(invoice.totalCents, invoice.currency)}
                </td>
              </tr>
            </tbody>
          </table>

          {invoice.status === "RECTIFIED" && related && (
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-strong">
              Factura anulada por la rectificativa{" "}
              <Link
                href={`/admin/factura/${related.id}`}
                className="font-medium underline"
              >
                {related.code}
              </Link>
              .
            </p>
          )}
          {invoice.series === "R" && related && (
            <p className="mt-3 text-xs text-ink-muted">
              Rectifica a la factura{" "}
              <Link
                href={`/admin/factura/${related.id}`}
                className="font-medium text-brand-700 underline"
              >
                {related.code}
              </Link>
              .
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
