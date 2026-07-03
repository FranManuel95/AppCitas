import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/shared";
import { formatCents } from "@/lib/money";
import { APPOINTMENT_STATUSES, STATUS_LABELS, type AppointmentStatus } from "@/lib/domain/types";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Citas" };

const PAGE_SIZE = 20;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    servicio?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    pagina?: string;
  }>;
}) {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const estado = APPOINTMENT_STATUSES.includes(sp.estado as AppointmentStatus)
    ? (sp.estado as AppointmentStatus)
    : undefined;

  const [business, services] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { timezone: true, currency: true },
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const where = {
    businessId: admin.businessId,
    ...(estado ? { status: estado } : {}),
    ...(sp.servicio ? { serviceId: sp.servicio } : {}),
    ...(sp.desde || sp.hasta
      ? {
          startAt: {
            ...(sp.desde ? { gte: new Date(`${sp.desde}T00:00:00Z`) } : {}),
            ...(sp.hasta ? { lt: new Date(`${sp.hasta}T23:59:59Z`) } : {}),
          },
        }
      : {}),
    ...(sp.q
      ? {
          client: {
            OR: [{ name: { contains: sp.q } }, { email: { contains: sp.q } }],
          },
        }
      : {}),
  };

  const [total, appointments] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: {
        service: { select: { name: true } },
        client: { select: { name: true, email: true } },
        staff: { select: { name: true, color: true } },
      },
      orderBy: { startAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();
  const formatter = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  function filterParams() {
    const params = new URLSearchParams();
    if (sp.estado) params.set("estado", sp.estado);
    if (sp.servicio) params.set("servicio", sp.servicio);
    if (sp.q) params.set("q", sp.q);
    if (sp.desde) params.set("desde", sp.desde);
    if (sp.hasta) params.set("hasta", sp.hasta);
    return params;
  }

  function pageLink(p: number) {
    const params = filterParams();
    params.set("pagina", String(p));
    return `/admin/citas?${params.toString()}`;
  }

  const exportHref = `/api/admin/export/appointments?${filterParams().toString()}`;

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={t.admin.citas.title}
        description={<>{fmt(t.admin.citas.resultsWithFilters, { count: total })}</>}
        action={
          <a
            href={exportHref}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            download
          >
            <Download className="h-4 w-4" aria-hidden />
            {t.admin.citas.exportCsv}
          </a>
        }
      />

      {/* Fila única de filtros (GET): comparten estado vía URL */}
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <Field label={t.admin.citas.filterStatus} htmlFor="estado">
          <Select id="estado" name="estado" defaultValue={sp.estado ?? ""}>
            <option value="">{t.admin.citas.filterAll}</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.admin.citas.filterService} htmlFor="servicio">
          <Select id="servicio" name="servicio" defaultValue={sp.servicio ?? ""}>
            <option value="">{t.admin.citas.filterAll}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.admin.citas.filterFrom} htmlFor="desde">
          <Input id="desde" type="date" name="desde" defaultValue={sp.desde ?? ""} />
        </Field>
        <Field label={t.admin.citas.filterTo} htmlFor="hasta">
          <Input id="hasta" type="date" name="hasta" defaultValue={sp.hasta ?? ""} />
        </Field>
        <div className="flex items-end gap-2">
          <Field label={t.admin.citas.filterClient} htmlFor="q" className="flex-1">
            <Input
              id="q"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder={t.admin.citas.filterClientPlaceholder}
            />
          </Field>
          <Button type="submit" variant="primary">
            {t.admin.citas.filterSubmit}
          </Button>
        </div>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">{t.admin.citas.colDate}</th>
              <th className="px-4 py-2.5 font-medium">{t.admin.citas.colClient}</th>
              <th className="px-4 py-2.5 font-medium">{t.admin.citas.colService}</th>
              <th className="px-4 py-2.5 font-medium">{t.admin.citas.colStatus}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t.admin.citas.colPrice}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t.admin.citas.colCharged}</th>
              <th className="px-4 py-2.5 font-medium">{t.admin.citas.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr
                key={a.id}
                className="border-b border-border transition-colors last:border-0 hover:bg-surface-3/60"
              >
                <td className="px-4 py-2.5 tabular-nums text-ink-soft">
                  {formatter.format(a.startAt)}
                </td>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{a.client.name}</p>
                  <p className="text-xs text-ink-muted">{a.client.email}</p>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {a.service.name}
                  {a.staff && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: a.staff.color }}
                      />
                      {a.staff.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                  {formatCents(a.priceCents, business.currency)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink">
                  {a.chargedCents > 0
                    ? formatCents(a.chargedCents, business.currency)
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <AppointmentActions
                    appointmentId={a.id}
                    status={a.status}
                    isPast={a.startAt.getTime() < now}
                    labels={t.admin.actions}
                  />
                  {a.chargedCents > 0 && (
                    <Link
                      href={`/admin/recibo/${a.id}`}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      <Receipt className="h-3.5 w-3.5" aria-hidden />
                      {t.admin.citas.receiptLink}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-ink-muted"
                >
                  {t.admin.citas.emptyWithFilters}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="tabular-nums text-ink-muted">
            {fmt(t.admin.citas.pageOf, { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageLink(page - 1)}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                {t.admin.citas.prevPage}
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageLink(page + 1)}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                {t.admin.citas.nextPage}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
