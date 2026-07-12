"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { fmt, type Dict } from "@/lib/i18n/shared";

type RescheduleLabels = Pick<
  Dict["myAppointments"],
  | "rescheduleCta"
  | "rescheduleTitle"
  | "rescheduleDate"
  | "rescheduleConfirm"
  | "rescheduling"
  | "rescheduleSuccess"
  | "rescheduleError"
  | "rescheduleWindowNote"
  | "noSlotsThatDay"
  | "goBack"
>;

interface SlotOption {
  startAt: string;
  label: string;
}

// Reprogramación inline desde "mis citas": el cliente elige una nueva fecha,
// ve los huecos libres del mismo servicio y confirma el cambio sin coste
// (solo disponible dentro del plazo de cancelación gratuita).
export function RescheduleAppointment({
  appointmentId,
  businessSlug,
  serviceId,
  minDateISO,
  maxDateISO,
  labels,
  endpoint,
}: {
  appointmentId: string;
  businessSlug: string;
  serviceId: string;
  minDateISO: string;
  maxDateISO: string;
  labels: RescheduleLabels;
  // Por defecto la ruta autenticada de "mis citas"; la página del enlace del
  // email (/c/{token}) pasa su ruta por token, sin sesión.
  endpoint?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateISO, setDateISO] = useState("");
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<SlotOption | null>(null);
  // Se incrementa para recargar la disponibilidad (p. ej. tras un 409).
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Al abrir el panel, lleva el foco al primer control (accesibilidad).
  useEffect(() => {
    if (open) dateInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !dateISO) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSelected(null);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ serviceId, date: dateISO });
        const res = await fetch(
          `/api/businesses/${businessSlug}/availability?${params.toString()}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? labels.rescheduleError);
        if (!cancelled) setSlots(json.slots);
      } catch (e) {
        if (!cancelled) {
          setSlots([]);
          setError(e instanceof Error ? e.message : labels.rescheduleError);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dateISO, reloadKey, businessSlug, serviceId, labels.rescheduleError]);

  async function confirmReschedule() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      endpoint ?? `/api/appointments/${appointmentId}/reschedule`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: selected.startAt }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.rescheduleError);
      // El hueco pudo ocuparse mientras se decidía: recarga disponibilidad
      if (res.status === 409) setReloadKey((k) => k + 1);
      setBusy(false);
      return;
    }
    setSuccess(
      fmt(labels.rescheduleSuccess, { slot: `${dateISO} · ${selected.label}` }),
    );
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSuccess(null);
            setOpen(true);
          }}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {labels.rescheduleCta}
        </Button>
        {success && (
          <p
            role="status"
            className="rounded-lg bg-success-soft px-3 py-1.5 text-xs font-medium text-success-strong"
          >
            {success}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-lg border border-border bg-surface-2 p-4 text-sm"
      role="group"
      aria-label={labels.rescheduleTitle}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) setOpen(false);
      }}
    >
      <p className="font-medium text-ink">{labels.rescheduleTitle}</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {labels.rescheduleWindowNote}
      </p>

      <Field
        label={labels.rescheduleDate}
        htmlFor={`reprogramar-${appointmentId}`}
        className="mt-3"
      >
        <Input
          ref={dateInputRef}
          id={`reprogramar-${appointmentId}`}
          type="date"
          className="max-w-xs"
          value={dateISO}
          min={minDateISO}
          max={maxDateISO}
          onChange={(e) => setDateISO(e.target.value)}
        />
      </Field>

      {dateISO && (
        <div className="mt-3" role="status" aria-live="polite">
          {loadingSlots && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          )}
          {!loadingSlots && slots && slots.length === 0 && (
            <p className="rounded-lg bg-surface-3 px-3 py-2.5 text-sm text-ink-muted">
              {labels.noSlotsThatDay}
            </p>
          )}
          {!loadingSlots && slots && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {slots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  aria-pressed={selected?.startAt === slot.startAt}
                  onClick={() => setSelected(slot)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition-colors",
                    selected?.startAt === slot.startAt
                      ? "border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600"
                      : "border-border bg-surface text-ink-soft hover:border-brand-300",
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !selected}
          onClick={confirmReschedule}
        >
          {busy ? labels.rescheduling : labels.rescheduleConfirm}
        </button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          {labels.goBack}
        </Button>
      </div>
    </div>
  );
}
