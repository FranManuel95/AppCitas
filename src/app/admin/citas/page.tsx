import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { formatCents } from "@/lib/money";
import { APPOINTMENT_STATUSES, STATUS_LABELS, type AppointmentStatus } from "@/lib/domain/types";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";

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
      },
      orderBy: { startAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();
  const formatter = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  function pageLink(p: number) {
    const params = new URLSearchParams();
    if (sp.estado) params.set("estado", sp.estado);
    if (sp.servicio) params.set("servicio", sp.servicio);
    if (sp.q) params.set("q", sp.q);
    if (sp.desde) params.set("desde", sp.desde);
    if (sp.hasta) params.set("hasta", sp.hasta);
    params.set("pagina", String(p));
    return `/admin/citas?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Citas</h1>
        <p className="text-sm text-slate-500">
          {total} resultados con los filtros actuales.
        </p>
      </div>

      {/* Fila única de filtros (GET): comparten estado vía URL */}
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <div>
          <label className="label" htmlFor="estado">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={sp.estado ?? ""}
            className="input"
          >
            <option value="">Todos</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="servicio">
            Servicio
          </label>
          <select
            id="servicio"
            name="servicio"
            defaultValue={sp.servicio ?? ""}
            className="input"
          >
            <option value="">Todos</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="desde">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="hasta">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            className="input"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="q">
              Cliente
            </label>
            <input
              id="q"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Nombre o email"
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary">
            Filtrar
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Servicio</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">Cobrado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {formatter.format(a.startAt)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{a.client.name}</p>
                  <p className="text-xs text-slate-400">{a.client.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{a.service.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatCents(a.priceCents, business.currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                  {a.chargedCents > 0
                    ? formatCents(a.chargedCents, business.currency)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <AppointmentActions
                    appointmentId={a.id}
                    status={a.status}
                    isPast={a.startAt.getTime() < now}
                  />
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay citas con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="btn-secondary">
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageLink(page + 1)} className="btn-secondary">
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
