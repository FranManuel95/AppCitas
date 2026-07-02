"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

interface SlotOption {
  startAt: string;
  endAt: string;
  label: string;
}

interface BookingWizardProps {
  business: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    currency: string;
    cancellationWindowHours: number;
    lateCancellationFeePercent: number;
    maxAdvanceBookingDays: number;
  };
  services: ServiceOption[];
  initialServiceId?: string;
  isLoggedIn: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingWizard({
  business,
  services,
  initialServiceId,
  isLoggedIn,
}: BookingWizardProps) {
  const [serviceId, setServiceId] = useState(
    initialServiceId && services.some((s) => s.id === initialServiceId)
      ? initialServiceId
      : (services[0]?.id ?? ""),
  );
  const [dateISO, setDateISO] = useState(addDays(todayISO(), 1));
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    startAt: string;
    service: string;
    freeCancellationUntil: string;
  } | null>(null);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const loadSlots = useCallback(async () => {
    if (!serviceId || !dateISO) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/businesses/${business.slug}/availability?serviceId=${encodeURIComponent(serviceId)}&date=${dateISO}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la disponibilidad");
      setSlots(json.slots);
    } catch (e) {
      setSlots([]);
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoadingSlots(false);
    }
  }, [business.slug, serviceId, dateISO]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function book() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          serviceId,
          startAt: selectedSlot.startAt,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // El hueco pudo ocuparse mientras se decidía: recarga disponibilidad
        if (json.code === "SLOT_TAKEN" || json.code === "SLOT_UNAVAILABLE") {
          await loadSlots();
        }
        throw new Error(json.error ?? "No se pudo crear la reserva");
      }
      setConfirmed({
        startAt: json.appointment.startAt,
        service: json.appointment.service,
        freeCancellationUntil: json.appointment.freeCancellationUntil,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  if (confirmed) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          ¡Cita confirmada!
        </h2>
        <p className="mt-2 text-slate-600">
          {confirmed.service} ·{" "}
          {dateFormatter.format(new Date(confirmed.startAt))}
        </p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Puedes cancelar gratis hasta el{" "}
          {dateFormatter.format(new Date(confirmed.freeCancellationUntil))}.
          Después se aplicará el cargo por cancelación tardía.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/mis-citas" className="btn-primary">
            Ver mis citas
          </Link>
          <Link href={`/b/${business.slug}`} className="btn-secondary">
            Volver al negocio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Paso 1: servicio */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">1. Elige servicio</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  s.id === serviceId
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {formatCents(s.priceCents, business.currency)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {s.durationMinutes} min
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Paso 2: fecha y hora */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">2. Elige fecha y hora</h2>
          <div className="mt-4">
            <label className="label" htmlFor="fecha">
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              className="input max-w-xs"
              value={dateISO}
              min={todayISO()}
              max={addDays(todayISO(), business.maxAdvanceBookingDays)}
              onChange={(e) => setDateISO(e.target.value)}
            />
          </div>
          <div className="mt-4">
            {loadingSlots && (
              <p className="text-sm text-slate-500">Buscando huecos…</p>
            )}
            {!loadingSlots && slots && slots.length === 0 && (
              <p className="text-sm text-slate-500">
                No hay huecos disponibles ese día. Prueba con otra fecha.
              </p>
            )}
            {!loadingSlots && slots && slots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedSlot?.startAt === slot.startAt
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Paso 3: confirmación */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">3. Confirma</h2>
          <div className="mt-4">
            <label className="label" htmlFor="notas">
              Notas para el negocio (opcional)
            </label>
            <textarea
              id="notas"
              className="input"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {isLoggedIn ? (
            <button
              className="btn-primary mt-4 w-full sm:w-auto"
              disabled={!selectedSlot || submitting}
              onClick={book}
            >
              {submitting
                ? "Reservando…"
                : selectedSlot && service
                  ? `Reservar ${service.name} · ${selectedSlot.label}`
                  : "Elige un hueco para reservar"}
            </button>
          ) : (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <Link
                href={`/login?next=/b/${business.slug}/reservar${serviceId ? `?servicio=${serviceId}` : ""}`}
                className="font-medium text-indigo-600"
              >
                Inicia sesión
              </Link>{" "}
              o{" "}
              <Link
                href={`/register?next=/b/${business.slug}/reservar${serviceId ? `?servicio=${serviceId}` : ""}`}
                className="font-medium text-indigo-600"
              >
                crea una cuenta
              </Link>{" "}
              para completar la reserva.
            </div>
          )}
        </section>
      </div>

      <aside>
        <div className="card sticky top-6">
          <h2 className="font-semibold text-slate-900">Resumen</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Negocio</dt>
              <dd className="text-slate-800">{business.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Servicio</dt>
              <dd className="text-slate-800">{service?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Duración</dt>
              <dd className="text-slate-800">
                {service ? `${service.durationMinutes} min` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Fecha</dt>
              <dd className="text-slate-800">
                {selectedSlot
                  ? dateFormatter.format(new Date(selectedSlot.startAt))
                  : dateISO}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <dt className="font-medium text-slate-700">Precio</dt>
              <dd className="font-semibold text-slate-900">
                {service
                  ? formatCents(service.priceCents, business.currency)
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Cancelación gratuita hasta {business.cancellationWindowHours} h
            antes. Después se cobra el {business.lateCancellationFeePercent}%
            del servicio.
          </p>
        </div>
      </aside>
    </div>
  );
}
