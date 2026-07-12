"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarPlus, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
}
interface StaffOption {
  id: string;
  name: string;
}
interface SlotOption {
  startAt: string;
  label: string;
  staffIds: string[];
}

// Cita manual del negocio (mostrador/teléfono): servicio → hueco (sin
// antelación mínima) → datos del cliente. El servidor reutiliza el mismo
// camino anti doble-reserva que la reserva online.
export function NewAppointmentForm({
  services,
  staff,
  defaultDate,
}: {
  services: ServiceOption[];
  staff: StaffOption[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !date) return;
    setSlots(null);
    setSlot(null);
    const params = new URLSearchParams({ serviceId, date });
    if (staffId) params.set("staffId", staffId);
    try {
      const res = await fetch(`/api/admin/availability?${params}`);
      const json = (await res.json()) as { slots?: SlotOption[] };
      setSlots(json.slots ?? []);
    } catch {
      setSlots([]);
    }
  }, [serviceId, date, staffId]);

  useEffect(() => {
    if (open) void loadSlots();
  }, [open, loadSlots]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId,
        startAt: slot.startAt,
        staffId: staffId || undefined,
        notes: notes.trim() || undefined,
        client: {
          name: clientName.trim(),
          email: clientEmail.trim() || undefined,
          phone: clientPhone.trim() || undefined,
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "No se pudo crear la cita");
      setBusy(false);
      return;
    }
    // Ir al día de la cita y limpiar el formulario
    setOpen(false);
    setBusy(false);
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setNotes("");
    router.push(`/admin/agenda?fecha=${date}`);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" aria-hidden />
        Nueva cita
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">
          Nueva cita (mostrador o teléfono)
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-3"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Servicio" htmlFor="na-service">
            <Select
              id="na-service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min
                </option>
              ))}
            </Select>
          </Field>
          {staff.length > 0 && (
            <Field label="Profesional" htmlFor="na-staff">
              <Select
                id="na-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Cualquiera disponible</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Fecha" htmlFor="na-date">
            <Input
              id="na-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="label mb-2">Hora</p>
          {slots === null ? (
            <p className="text-sm text-ink-muted">Buscando huecos…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No hay huecos libres ese día.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s.startAt}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm tabular-nums transition-colors",
                    slot?.startAt === s.startAt
                      ? "border-brand-600 bg-brand-600 font-medium text-white"
                      : "border-border text-ink-soft hover:border-brand-300",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre del cliente" htmlFor="na-name">
            <Input
              id="na-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              minLength={2}
              placeholder="Marta García"
            />
          </Field>
          <Field label="Teléfono (para recordatorios)" htmlFor="na-phone">
            <Input
              id="na-phone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="600 111 222"
            />
          </Field>
          <Field label="Email (opcional)" htmlFor="na-email">
            <Input
              id="na-email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="marta@correo.com"
            />
          </Field>
        </div>

        <Field label="Notas (opcional)" htmlFor="na-notes">
          <Input
            id="na-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || !slot || !clientName.trim()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CalendarPlus className="h-4 w-4" aria-hidden />
            )}
            {slot ? `Crear cita · ${slot.label}` : "Elige una hora"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
