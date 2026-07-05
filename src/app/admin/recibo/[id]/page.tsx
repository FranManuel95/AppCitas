import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/shared";
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
  const { locale, t } = await getDict();
  const r = t.admin.recibo;
  const intl = locale === "es" ? "es-ES" : "en";
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

  const when = new Intl.DateTimeFormat(intl, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: b.timezone,
  }).format(appointment.startAt);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/admin/citas"
          className="text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
        >
          {r.backToAppointments}
        </Link>
        <PrintButton label={r.print} />
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
              <p className="text-sm text-ink-muted">
                {fmt(r.taxIdLine, { taxId: b.taxId })}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tracking-widest text-ink">
              {r.receiptHeading}
            </p>
            <p className="text-xs tabular-nums text-ink-muted">
              {fmt(r.ref, { ref: appointment.id.slice(-10).toUpperCase() })}
            </p>
            <p className="text-xs tabular-nums text-ink-muted">
              {new Date().toLocaleDateString(intl)}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{r.client}</dt>
            <dd className="text-right text-ink">
              {appointment.client.name}
              <span className="block text-xs text-ink-muted">
                {appointment.client.email}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{r.service}</dt>
            <dd className="text-ink">{appointment.service.name}</dd>
          </div>
          {appointment.staff && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{r.staff}</dt>
              <dd className="text-ink">{appointment.staff.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{r.appointmentDate}</dt>
            <dd className="text-ink">{when}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{r.concept}</dt>
            <dd className="text-ink">
              {STATUS_LABELS[appointment.status as AppointmentStatus] ??
                appointment.status}
              {appointment.clientPackageId
                ? r.packageSuffix
                : appointment.coupon
                  ? fmt(r.couponSuffix, { code: appointment.coupon.code })
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
                    <td className="py-1 text-ink-muted">{r.servicePrice}</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(
                        appointment.priceCents + appointment.discountCents,
                        b.currency,
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-muted">{r.discount}</td>
                    <td className="py-1 text-right tabular-nums text-success-strong">
                      −{formatCents(appointment.discountCents, b.currency)}
                    </td>
                  </tr>
                </>
              )}
              {b.taxPercent > 0 && (
                <>
                  <tr>
                    <td className="py-1 text-ink-muted">{r.taxBase}</td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(base, b.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-muted">
                      {fmt(r.vat, { percent: b.taxPercent })}
                    </td>
                    <td className="py-1 text-right tabular-nums text-ink-soft">
                      {formatCents(tax, b.currency)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t border-border-strong">
                <td className="py-2 font-semibold text-ink">
                  {r.totalCharged}
                </td>
                <td className="py-2 text-right text-lg font-bold tabular-nums text-ink">
                  {formatCents(total, b.currency)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">
            {fmt(r.paymentStatus, {
              status:
                appointment.paymentStatus === "CHARGED"
                  ? r.paymentCharged
                  : appointment.paymentStatus === "SIMULATED"
                    ? r.paymentSimulated
                    : appointment.paymentStatus === "UNCOLLECTED"
                      ? r.paymentUncollected
                      : appointment.paymentStatus === "CHARGE_FAILED"
                        ? r.paymentChargeFailed
                        : t.admin.common.emptyValue,
            })}
          </p>
          {appointment.paymentMethod && (
            <p className="mt-1 text-xs text-ink-muted">
              {fmt(r.paymentMethod, {
                method:
                  appointment.paymentMethod === "CASH"
                    ? r.methodCash
                    : appointment.paymentMethod === "CARD_TERMINAL"
                      ? r.methodCardTerminal
                      : r.methodCardOnline,
              })}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
