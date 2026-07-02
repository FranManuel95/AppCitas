"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface BusinessSettings {
  name: string;
  description: string | null;
  category: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  cancellationWindowHours: number;
  lateCancellationFeePercent: number;
  slotGranularityMinutes: number;
  maxAdvanceBookingDays: number;
  minNoticeMinutes: number;
  requireCardToBook: boolean;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notifyByWhatsapp: boolean;
}

export function SettingsForm({ business }: { business: BusinessSettings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const str = (k: string) => String(form.get(k) ?? "").trim();
    const num = (k: string) => Number(form.get(k));

    const bool = (k: string) => form.get(k) === "on";

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: str("name"),
        description: str("description") || null,
        category: str("category") || "general",
        address: str("address") || null,
        phone: str("phone") || null,
        email: str("email") || null,
        cancellationWindowHours: num("cancellationWindowHours"),
        lateCancellationFeePercent: num("lateCancellationFeePercent"),
        slotGranularityMinutes: num("slotGranularityMinutes"),
        maxAdvanceBookingDays: num("maxAdvanceBookingDays"),
        minNoticeMinutes: num("minNoticeMinutes"),
        requireCardToBook: bool("requireCardToBook"),
        remindersEnabled: bool("remindersEnabled"),
        reminderHoursBefore: num("reminderHoursBefore"),
        notifyByEmail: bool("notifyByEmail"),
        notifyBySms: bool("notifyBySms"),
        notifyByWhatsapp: bool("notifyByWhatsapp"),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo guardar" });
    } else {
      setMessage({ kind: "ok", text: "Ajustes guardados" });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold text-slate-900">Datos del negocio</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Nombre</label>
            <input
              name="name"
              required
              minLength={2}
              defaultValue={business.name}
              className="input"
            />
          </div>
          <div>
            <label className="label">Sector</label>
            <input
              name="category"
              defaultValue={business.category}
              placeholder="general, belleza, salud…"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={business.description ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input
              name="address"
              defaultValue={business.address ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input
              name="phone"
              defaultValue={business.phone ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label">Email de contacto</label>
            <input
              name="email"
              type="email"
              defaultValue={business.email ?? ""}
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-900">
          Política de reservas y cancelación
        </h2>
        <p className="text-xs text-slate-500">
          Estas reglas se aplican automáticamente a todas las reservas.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">
              Ventana de cancelación gratuita (horas)
            </label>
            <input
              name="cancellationWindowHours"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={business.cancellationWindowHours}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">
              Cancelar con menos antelación genera cargo. 24 = un día.
            </p>
          </div>
          <div>
            <label className="label">Cargo por cancelación tardía (%)</label>
            <input
              name="lateCancellationFeePercent"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={business.lateCancellationFeePercent}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">
              Porcentaje del precio del servicio. 100 = importe íntegro.
            </p>
          </div>
          <div>
            <label className="label">Granularidad de huecos (minutos)</label>
            <input
              name="slotGranularityMinutes"
              type="number"
              min={5}
              max={120}
              step={5}
              required
              defaultValue={business.slotGranularityMinutes}
              className="input"
            />
          </div>
          <div>
            <label className="label">Antelación mínima (minutos)</label>
            <input
              name="minNoticeMinutes"
              type="number"
              min={0}
              max={10080}
              required
              defaultValue={business.minNoticeMinutes}
              className="input"
            />
          </div>
          <div>
            <label className="label">Reserva máxima con antelación (días)</label>
            <input
              name="maxAdvanceBookingDays"
              type="number"
              min={1}
              max={365}
              required
              defaultValue={business.maxAdvanceBookingDays}
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-900">
          Recordatorios y notificaciones
        </h2>
        <p className="text-xs text-slate-500">
          Confirmación al reservar y recordatorio con enlace de asistencia
          (&quot;¿vas a venir?&quot;) antes de cada cita.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="remindersEnabled"
              defaultChecked={business.remindersEnabled}
            />
            Enviar recordatorio antes de la cita
          </label>
          <div className="max-w-xs">
            <label className="label">Horas de antelación del recordatorio</label>
            <input
              name="reminderHoursBefore"
              type="number"
              min={1}
              max={336}
              required
              defaultValue={business.reminderHoursBefore}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">
              Consejo: mayor que la ventana de cancelación, para que el cliente
              aún pueda cancelar gratis desde el recordatorio.
            </p>
          </div>
          <p className="pt-1 text-sm font-medium text-slate-700">Canales</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="notifyByEmail"
                defaultChecked={business.notifyByEmail}
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="notifyBySms"
                defaultChecked={business.notifyBySms}
              />
              SMS
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="notifyByWhatsapp"
                defaultChecked={business.notifyByWhatsapp}
              />
              WhatsApp
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Cada canal requiere su proveedor configurado en el servidor (SMTP,
            Twilio, UltraMsg o Evolution API). Sin configurar, los mensajes
            quedan registrados pero no se envían.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-900">Pagos</h2>
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="requireCardToBook"
              defaultChecked={business.requireCardToBook}
            />
            Exigir tarjeta guardada para reservar
          </label>
          <p className="text-xs text-slate-400">
            Permite cobrar automáticamente el cargo por cancelación tardía o
            no-show. Requiere Stripe configurado en el servidor; sin tarjeta
            guardada, el cargo queda registrado para cobrarlo en persona.
          </p>
        </div>
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Guardando…" : "Guardar ajustes"}
      </button>
    </form>
  );
}
