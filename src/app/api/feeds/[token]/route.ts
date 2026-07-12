import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { DomainError } from "@/lib/domain/errors";
import { buildAgendaFeedIcs } from "@/lib/notifications/ics";

export const dynamic = "force-dynamic";

// GET /api/feeds/[token] — feed iCal privado de la agenda del negocio.
// Google Calendar/Outlook se suscriben a esta URL ("añadir por URL"): el token
// largo y regenerable ES la autenticación (igual que el enlace /c/{token}).
// Filtro opcional ?staff=<id> para el calendario personal de un empleado.
export const GET = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ token: string }> },
  ) => {
    const { token } = await params;
    const business = await prisma.business.findFirst({
      where: { icsFeedToken: token, active: true },
      select: { id: true, name: true, address: true, timezone: true },
    });
    if (!business) {
      throw new DomainError("Feed no encontrado", "FEED_NOT_FOUND", 404);
    }

    const staffId =
      new URL(request.url).searchParams.get("staff") || undefined;
    const now = new Date();

    // Ventana práctica: desde hace 30 días hasta dentro de 180
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        ...(staffId ? { staffId } : {}),
        startAt: {
          gte: new Date(now.getTime() - 30 * 86_400_000),
          lte: new Date(now.getTime() + 180 * 86_400_000),
        },
      },
      include: {
        service: { select: { name: true } },
        client: { select: { name: true, phone: true } },
        staff: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
      take: 1000,
    });

    const ics = buildAgendaFeedIcs(
      staffId
        ? `${business.name} · ${appointments[0]?.staff?.name ?? "Agenda"}`
        : `${business.name} · Agenda`,
      appointments.map((a) => ({
        uid: `${a.id}@appcitas`,
        startAt: a.startAt,
        endAt: a.endAt,
        summary: `${a.service.name} · ${a.client.name}`,
        description: [
          a.staff ? `Profesional: ${a.staff.name}` : null,
          a.client.phone ? `Teléfono: ${a.client.phone}` : null,
          a.notes ? `Notas: ${a.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        location: business.address ?? undefined,
      })),
      now,
    );

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": 'inline; filename="agenda.ics"',
      },
    });
  },
);
