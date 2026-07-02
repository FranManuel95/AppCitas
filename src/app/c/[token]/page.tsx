import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { AttendanceForm } from "@/components/attendance-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmar asistencia" };

// Página pública enlazada desde el recordatorio (WhatsApp/SMS/email).
// El token único de la cita actúa como acceso: no requiere iniciar sesión.
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { confirmationToken: token },
    include: {
      service: { select: { name: true, durationMinutes: true } },
      staff: { select: { name: true } },
      client: { select: { name: true } },
      business: {
        select: {
          name: true,
          slug: true,
          address: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
        },
      },
    },
  });

  if (!appointment) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Enlace no válido
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Este enlace de confirmación no existe o ha caducado.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Ir a AppCitas
          </Link>
        </div>
      </main>
    );
  }

  const when = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: appointment.business.timezone,
  }).format(appointment.startAt);

  const isActive =
    appointment.status === "CONFIRMED" &&
    appointment.startAt.getTime() > Date.now();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="card w-full max-w-md">
        <p className="text-sm text-slate-500">Hola {appointment.client.name} 👋</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          Tu cita en {appointment.business.name}
        </h1>

        <dl className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Servicio</dt>
            <dd className="text-right font-medium text-slate-800">
              {appointment.service.name}
            </dd>
          </div>
          {appointment.staff && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Profesional</dt>
              <dd className="text-right text-slate-800">
                {appointment.staff.name}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Fecha</dt>
            <dd className="text-right text-slate-800">{when}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Precio</dt>
            <dd className="text-right font-medium text-slate-800">
              {formatCents(appointment.priceCents, appointment.business.currency)}
            </dd>
          </div>
          {appointment.business.address && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Dirección</dt>
              <dd className="text-right text-slate-800">
                {appointment.business.address}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          {isActive ? (
            <AttendanceForm
              token={token}
              startAt={appointment.startAt.toISOString()}
              windowHours={appointment.business.cancellationWindowHours}
              feePercent={appointment.business.lateCancellationFeePercent}
              priceCents={appointment.priceCents}
              currency={appointment.business.currency}
              alreadyConfirmed={!!appointment.attendanceConfirmedAt}
            />
          ) : (
            <div className="text-center">
              <StatusBadge status={appointment.status} />
              <p className="mt-2 text-sm text-slate-500">
                {appointment.startAt.getTime() <= Date.now() &&
                appointment.status === "CONFIRMED"
                  ? "Esta cita ya ha pasado."
                  : "Esta cita ya no está activa."}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
