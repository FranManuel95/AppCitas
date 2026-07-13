import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";
import { isSentinelEmail } from "./guest-clients";

// CRM ligero del negocio: la "cartera de clientes" se deriva de las citas
// (no hay tabla propia de pertenencia) y se enriquece con métricas de
// fiabilidad y notas privadas. Todo va filtrado por businessId.

export interface ClientSummary {
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  totalAppointments: number;
  completed: number;
  noShows: number;
  lateCancellations: number;
  spentCents: number;
  lastVisit: Date | null;
  // % de citas pasadas a las que acudió (completadas / (completadas + no-shows));
  // null si aún no hay historial que juzgar.
  reliabilityPercent: number | null;
}

function reliability(completed: number, noShows: number): number | null {
  const judged = completed + noShows;
  if (judged === 0) return null;
  return Math.round((completed / judged) * 100);
}

export async function getBusinessClients(
  businessId: string,
): Promise<ClientSummary[]> {
  const [grouped, noted] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["clientId", "status"],
      where: { businessId },
      _count: { _all: true },
      _sum: { chargedCents: true },
      _max: { startAt: true },
    }),
    // Cartera sin citas aún: clientes con notas del negocio (importados de
    // CSV o fichados a mano) también son "sus clientes".
    prisma.clientNote.findMany({
      where: { businessId },
      select: { clientId: true },
      distinct: ["clientId"],
    }),
  ]);
  if (grouped.length === 0 && noted.length === 0) return [];

  const byClient = new Map<
    string,
    {
      total: number;
      completed: number;
      noShows: number;
      late: number;
      spent: number;
      lastVisit: Date | null;
    }
  >();
  for (const row of grouped) {
    const c = byClient.get(row.clientId) ?? {
      total: 0,
      completed: 0,
      noShows: 0,
      late: 0,
      spent: 0,
      lastVisit: null,
    };
    c.total += row._count._all;
    c.spent += row._sum.chargedCents ?? 0;
    if (row.status === "COMPLETED") {
      c.completed += row._count._all;
      if (
        row._max.startAt &&
        (!c.lastVisit || row._max.startAt > c.lastVisit)
      ) {
        c.lastVisit = row._max.startAt;
      }
    }
    if (row.status === "NO_SHOW") c.noShows += row._count._all;
    if (row.status === "CANCELLED_LATE") c.late += row._count._all;
    byClient.set(row.clientId, c);
  }

  // Importados/fichados sin citas: fila a cero para que aparezcan en la lista
  for (const { clientId } of noted) {
    if (!byClient.has(clientId)) {
      byClient.set(clientId, {
        total: 0,
        completed: 0,
        noShows: 0,
        late: 0,
        spent: 0,
        lastVisit: null,
      });
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...byClient.keys()] } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return [...byClient.entries()]
    .map(([clientId, m]) => {
      const u = userById.get(clientId);
      return {
        clientId,
        name: u?.name ?? "(cliente eliminado)",
        email: u && !isSentinelEmail(u.email) ? u.email : "",
        phone: u?.phone ?? null,
        totalAppointments: m.total,
        completed: m.completed,
        noShows: m.noShows,
        lateCancellations: m.late,
        spentCents: m.spent,
        lastVisit: m.lastVisit,
        reliabilityPercent: reliability(m.completed, m.noShows),
      };
    })
    .sort((a, b) => b.totalAppointments - a.totalAppointments);
}

export async function getClientDetail(businessId: string, clientId: string) {
  // Pertenencia: solo es "cliente del negocio" quien tiene alguna cita en él.
  const [user, appointments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        guest: true,
        createdAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: { businessId, clientId },
      include: {
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
      take: 100,
    }),
  ]);
  if (!user || appointments.length === 0) {
    throw new DomainError("Cliente no encontrado", "CLIENT_NOT_FOUND", 404);
  }

  const notes = await prisma.clientNote.findMany({
    where: { businessId, clientId },
    orderBy: { createdAt: "desc" },
  });

  const completed = appointments.filter((a) => a.status === "COMPLETED").length;
  const noShows = appointments.filter((a) => a.status === "NO_SHOW").length;
  const late = appointments.filter(
    (a) => a.status === "CANCELLED_LATE",
  ).length;
  const spentCents = appointments.reduce((sum, a) => sum + a.chargedCents, 0);
  const lastVisit =
    appointments.find((a) => a.status === "COMPLETED")?.startAt ?? null;
  const nextAppointment =
    [...appointments]
      .reverse()
      .find(
        (a) => a.status === "CONFIRMED" && a.startAt.getTime() > Date.now(),
      ) ?? null;

  return {
    client: user,
    appointments,
    notes,
    metrics: {
      totalAppointments: appointments.length,
      completed,
      noShows,
      lateCancellations: late,
      spentCents,
      lastVisit,
      nextAppointmentAt: nextAppointment?.startAt ?? null,
      reliabilityPercent: reliability(completed, noShows),
    },
  };
}

export async function addClientNote(params: {
  businessId: string;
  clientId: string;
  text: string;
  authorName?: string;
}) {
  const { businessId, clientId, text, authorName } = params;
  // Solo sobre clientes reales del negocio (misma regla que el detalle).
  const hasAppointment = await prisma.appointment.findFirst({
    where: { businessId, clientId },
    select: { id: true },
  });
  if (!hasAppointment) {
    throw new DomainError("Cliente no encontrado", "CLIENT_NOT_FOUND", 404);
  }
  return prisma.clientNote.create({
    data: { businessId, clientId, text: text.trim(), authorName },
  });
}

export async function deleteClientNote(params: {
  businessId: string;
  noteId: string;
}) {
  const { businessId, noteId } = params;
  const result = await prisma.clientNote.deleteMany({
    where: { id: noteId, businessId },
  });
  if (result.count === 0) {
    throw new DomainError("Nota no encontrada", "NOTE_NOT_FOUND", 404);
  }
}
