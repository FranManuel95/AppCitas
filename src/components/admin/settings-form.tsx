"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";
import { Switch } from "@/components/ui/switch";

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
  taxId: string | null;
  taxPercent: number;
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
        taxId: str("taxId") || null,
        taxPercent: num("taxPercent"),
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
      <Card>
        <SectionHeader as="h2" title="Datos del negocio" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="settings-name">
            <Input
              id="settings-name"
              name="name"
              required
              minLength={2}
              defaultValue={business.name}
            />
          </Field>
          <Field label="Sector" htmlFor="settings-category">
            <Input
              id="settings-category"
              name="category"
              defaultValue={business.category}
              placeholder="general, belleza, salud…"
            />
          </Field>
          <Field
            label="Descripción"
            htmlFor="settings-description"
            className="sm:col-span-2"
          >
            <Textarea
              id="settings-description"
              name="description"
              rows={2}
              defaultValue={business.description ?? ""}
            />
          </Field>
          <Field label="Dirección" htmlFor="settings-address">
            <Input
              id="settings-address"
              name="address"
              defaultValue={business.address ?? ""}
            />
          </Field>
          <Field label="Teléfono" htmlFor="settings-phone">
            <Input
              id="settings-phone"
              name="phone"
              defaultValue={business.phone ?? ""}
            />
          </Field>
          <Field label="Email de contacto" htmlFor="settings-email">
            <Input
              id="settings-email"
              name="email"
              type="email"
              defaultValue={business.email ?? ""}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader
          as="h2"
          title="Política de reservas y cancelación"
          description="Estas reglas se aplican automáticamente a todas las reservas."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Ventana de cancelación gratuita (horas)"
            htmlFor="settings-cancellation-window"
            hint="Cancelar con menos antelación genera cargo. 24 = un día."
          >
            <Input
              id="settings-cancellation-window"
              name="cancellationWindowHours"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={business.cancellationWindowHours}
            />
          </Field>
          <Field
            label="Cargo por cancelación tardía (%)"
            htmlFor="settings-late-fee"
            hint="Porcentaje del precio del servicio. 100 = importe íntegro."
          >
            <Input
              id="settings-late-fee"
              name="lateCancellationFeePercent"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={business.lateCancellationFeePercent}
            />
          </Field>
          <Field
            label="Granularidad de huecos (minutos)"
            htmlFor="settings-slot-granularity"
          >
            <Input
              id="settings-slot-granularity"
              name="slotGranularityMinutes"
              type="number"
              min={5}
              max={120}
              step={5}
              required
              defaultValue={business.slotGranularityMinutes}
            />
          </Field>
          <Field
            label="Antelación mínima (minutos)"
            htmlFor="settings-min-notice"
          >
            <Input
              id="settings-min-notice"
              name="minNoticeMinutes"
              type="number"
              min={0}
              max={10080}
              required
              defaultValue={business.minNoticeMinutes}
            />
          </Field>
          <Field
            label="Reserva máxima con antelación (días)"
            htmlFor="settings-max-advance"
          >
            <Input
              id="settings-max-advance"
              name="maxAdvanceBookingDays"
              type="number"
              min={1}
              max={365}
              required
              defaultValue={business.maxAdvanceBookingDays}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader
          as="h2"
          title="Recordatorios y notificaciones"
          description={
            <>
              Confirmación al reservar y recordatorio con enlace de asistencia
              (&quot;¿vas a venir?&quot;) antes de cada cita.
            </>
          }
        />
        <div className="mt-5 space-y-4">
          <Switch
            name="remindersEnabled"
            defaultChecked={business.remindersEnabled}
            label="Enviar recordatorio antes de la cita"
          />
          <Field
            label="Horas de antelación del recordatorio"
            htmlFor="settings-reminder-hours"
            hint="Consejo: mayor que la ventana de cancelación, para que el cliente aún pueda cancelar gratis desde el recordatorio."
            className="max-w-xs"
          >
            <Input
              id="settings-reminder-hours"
              name="reminderHoursBefore"
              type="number"
              min={1}
              max={336}
              required
              defaultValue={business.reminderHoursBefore}
            />
          </Field>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-ink-soft">Canales</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <Switch
                name="notifyByEmail"
                defaultChecked={business.notifyByEmail}
                label="Email"
              />
              <Switch
                name="notifyBySms"
                defaultChecked={business.notifyBySms}
                label="SMS"
              />
              <Switch
                name="notifyByWhatsapp"
                defaultChecked={business.notifyByWhatsapp}
                label="WhatsApp"
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            Cada canal requiere su proveedor configurado en el servidor (SMTP,
            Twilio, UltraMsg o Evolution API). Sin configurar, los mensajes
            quedan registrados pero no se envían.
          </p>
        </div>
      </Card>

      <Card>
        <SectionHeader as="h2" title="Facturación (recibos)" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="NIF/CIF (aparece en los recibos)"
            htmlFor="settings-tax-id"
          >
            <Input
              id="settings-tax-id"
              name="taxId"
              defaultValue={business.taxId ?? ""}
            />
          </Field>
          <Field
            label="% de IVA a desglosar (0 = sin desglose)"
            htmlFor="settings-tax-percent"
          >
            <Input
              id="settings-tax-percent"
              name="taxPercent"
              type="number"
              min={0}
              max={50}
              required
              defaultValue={business.taxPercent}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader as="h2" title="Pagos" />
        <div className="mt-5 space-y-3">
          <Switch
            name="requireCardToBook"
            defaultChecked={business.requireCardToBook}
            label="Exigir tarjeta guardada para reservar"
          />
          <p className="text-xs text-ink-muted">
            Permite cobrar automáticamente el cargo por cancelación tardía o
            no-show. Requiere Stripe configurado en el servidor; sin tarjeta
            guardada, el cargo queda registrado para cobrarlo en persona.
          </p>
        </div>
      </Card>

      {message && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-success-soft text-success-strong"
              : "bg-danger-soft text-danger-strong"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {message.text}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Guardando…" : "Guardar ajustes"}
      </Button>
    </form>
  );
}
