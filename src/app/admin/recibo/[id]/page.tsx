import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { formatCents } from "@/lib/money";
import { STATUS_LABELS, type AppointmentStatus } from "@/lib/domain/types";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo" };

// Recibo imprimible de una cita con importe cobrado. Nota: es un recibo
// simple, no una factura fiscal con numeración correlativa (roadmap).
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { id } = await params;

  const appointment = await prisma.appointment.findFirst({
    where: { id, businessId: admin.businessId },
    include: {
      business: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      client: { select: { name: true, email: true, phone: true } },
      coupon: { select: { code: true } },
    },
  });
  if (!appointment) notFound();

  const b = appointment.business;
  const total = appointment.chargedCents;
  // Con IVA configurado, el precio se entiende IVA incluido y se desglosa
  const base =
    b.taxPercent > 0 ? Math.round(total / (1 + b.taxPercent / 100)) : total;
  const tax = total - base;

  const when = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: b.timezone,
  }).format(appointment.startAt);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/admin/citas"
          className="text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
        >
          ← Volver a citas
        </Link>
        <PrintButton />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {b.name}
            </h1>
            <p className="text-sm text-ink-muted">
              {[b.address, b.phone, b.email].filter(Boolean).join(" · ")}
            </p>
            {b.taxId && (
              <p className="text-sm text-ink-muted">NIF/CIF: {b.taxId}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tracking-widest text-ink">
              RECIBO
            </p>
            <p className="text-xs tabular-nums text-ink-muted">
              Ref. {appointment.id.slice(-10).toUpperCase()}
            </p>
            <p className="text-xs tabular-nums text-ink-muted">
              {new Date().toLocaleDateString("es-ES")}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Cliente</dt>
            <dd className="text-right text-ink">
              {appointment.client.name}
              <span className="block text-xs text-ink-muted">
                {appointment.client.email}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Servicio</dt>
            <dd className="text-ink">{appointment.service.name}</dd>
          </div>
          {appointment.staff && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Profesional</dt>
              <dd className="text-ink">{appointment.staff.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Fecha de la cita</dt>
            <dd className="text-ink">{when}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Concepto</dt>
            <dd className="text-ink">
              {STATUS_LABELS[appointment.status as AppointmentStatus] ??
                appointment.status}
              {appointment.clientPackageId
                ? " (bono)"
                : appointment.coupon
                  ? ` (cupón ${appointment.coupon.code})`
                  : ""}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-4">
          <table className="w-full text-sm">
            <tbody>
              {appointment.discountCents > 0 && (
                <>
                  <tr>
                    <td className="py-1 text-ink-muted">Precio del servicio</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(
                        appointment.priceCents + appointment.discountCents,
                        b.currency,
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-muted">Descuento</td>
                    <td className="py-1 text-right tabular-nums text-success-strong">
                      −{formatCents(appointment.discountCents, b.currency)}
                    </td>
                  </tr>
                </>
              )}
              {b.taxPercent > 0 && (
                <>
                  <tr>
                    <td className="py-1 text-ink-muted">Base imponible</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(base, b.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-muted">
                      IVA ({b.taxPercent}%)
                    </td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(tax, b.currency)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t border-border-strong">
                <td className="py-2 font-semibold text-ink">Total cobrado</td>
                <td className="py-2 text-right text-lg font-bold tabular-nums text-ink">
                  {formatCents(total, b.currency)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">
            Estado del cobro: {appointment.paymentStatus === "CHARGED"
              ? "cobrado con tarjeta"
              : appointment.paymentStatus === "SIMULATED"
                ? "cobro simulado (entorno de pruebas)"
                : appointment.paymentStatus === "UNCOLLECTED"
                  ? "pendiente / cobrado en persona"
                  : appointment.paymentStatus === "CHARGE_FAILED"
                    ? "cargo rechazado — gestionar en persona"
                    : "—"}
          </p>
        </div>
      </Card>
    </div>
  );
}
