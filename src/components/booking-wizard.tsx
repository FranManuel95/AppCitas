"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { CardSetup } from "./card-setup";

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

interface StaffOption {
  id: string;
  name: string;
  color: string;
  serviceIds: string[]; // vacío = realiza todos
}

interface SlotOption {
  startAt: string;
  endAt: string;
  label: string;
  staffIds: string[];
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
    requireCardToBook: boolean;
  };
  services: ServiceOption[];
  staff: StaffOption[];
  initialServiceId?: string;
  isLoggedIn: boolean;
  userHasPhone: boolean;
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
  staff,
  initialServiceId,
  isLoggedIn,
  userHasPhone,
}: BookingWizardProps) {
  const [serviceId, setServiceId] = useState(
    initialServiceId && services.some((s) => s.id === initialServiceId)
      ? initialServiceId
      : (services[0]?.id ?? ""),
  );
  // "" = cualquier profesional disponible
  const [staffId, setStaffId] = useState("");
  const [dateISO, setDateISO] = useState(addDays(todayISO(), 1));
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [cardSaved, setCardSaved] = useState(!business.requireCardToBook);
  const [checkingCard, setCheckingCard] = useState(
    business.requireCardToBook && isLoggedIn,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    startAt: string;
    service: string;
    staff: string | null;
    freeCancellationUntil: string;
  } | null>(null);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Profesionales cualificados para el servicio elegido
  const qualifiedStaff = useMemo(
    () =>
      staff.filter(
        (m) => m.serviceIds.length === 0 || m.serviceIds.includes(serviceId),
      ),
    [staff, serviceId],
  );
  const hasStaff = staff.length > 0;

  // ¿Tiene ya tarjeta guardada? (solo si el negocio la exige)
  useEffect(() => {
    if (!business.requireCardToBook || !isLoggedIn) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/payments/setup-intent");
      const json = await res.json().catch(() => ({}));
      if (!cancelled) {
        setCardSaved(!!json.hasCard);
        setCheckingCard(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business.requireCardToBook, isLoggedIn]);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !dateISO) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);
    try {
      const params = new URLSearchParams({ serviceId, date: dateISO });
      if (staffId) params.set("staffId", staffId);
      const res = await fetch(
        `/api/businesses/${business.slug}/availability?${params.toString()}`,
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
  }, [business.slug, serviceId, staffId, dateISO]);

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
          staffId: staffId || undefined,
          notes: notes.trim() || undefined,
          phone: phone.trim() || undefined,
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
        staff: json.appointment.staff,
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
          {confirmed.service}
          {confirmed.staff ? ` con ${confirmed.staff}` : ""} ·{" "}
          {dateFormatter.format(new Date(confirmed.startAt))}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Te hemos enviado la confirmación y recibirás un recordatorio antes de
          la cita.
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

  let step = 1;
  const canBook =
    isLoggedIn && !!selectedSlot && (cardSaved || !business.requireCardToBook);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Servicio */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">
            {step++}. Elige servicio
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceId(s.id);
                  setStaffId("");
                }}
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

        {/* Profesional (solo negocios con equipo) */}
        {hasStaff && (
          <section className="card">
            <h2 className="font-semibold text-slate-900">
              {step++}. Elige profesional
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setStaffId("")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  staffId === ""
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Cualquiera disponible
              </button>
              {qualifiedStaff.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setStaffId(m.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    staffId === m.id
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: m.color }}
                  />
                  {m.name}
                </button>
              ))}
            </div>
            {qualifiedStaff.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                Ningún profesional realiza este servicio actualmente.
              </p>
            )}
          </section>
        )}

        {/* Fecha y hora */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">
            {step++}. Elige fecha y hora
          </h2>
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

        {/* Confirmación */}
        <section className="card">
          <h2 className="font-semibold text-slate-900">{step++}. Confirma</h2>

          {isLoggedIn && !userHasPhone && (
            <div className="mt-4">
              <label className="label" htmlFor="telefono">
                Teléfono para recordatorios por WhatsApp/SMS (opcional)
              </label>
              <input
                id="telefono"
                type="tel"
                className="input max-w-xs"
                placeholder="+34 600 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}

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

          {/* Tarjeta (solo si el negocio la exige) */}
          {isLoggedIn && business.requireCardToBook && (
            <div className="mt-4">
              <p className="label">Tarjeta para posibles cargos</p>
              <p className="mb-2 text-xs text-slate-500">
                Este negocio requiere una tarjeta guardada. Solo se usa si
                cancelas con menos de {business.cancellationWindowHours} h o no
                te presentas.
              </p>
              {checkingCard ? (
                <p className="text-sm text-slate-500">Comprobando tarjeta…</p>
              ) : cardSaved ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Tarjeta guardada ✓
                </p>
              ) : (
                <CardSetup onSaved={() => setCardSaved(true)} />
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {isLoggedIn ? (
            <button
              className="btn-primary mt-4 w-full sm:w-auto"
              disabled={!canBook || submitting}
              onClick={book}
            >
              {submitting
                ? "Reservando…"
                : !selectedSlot
                  ? "Elige un hueco para reservar"
                  : business.requireCardToBook && !cardSaved
                    ? "Guarda una tarjeta para reservar"
                    : service
                      ? `Reservar ${service.name} · ${selectedSlot.label}`
                      : "Reservar"}
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
            {hasStaff && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Profesional</dt>
                <dd className="text-slate-800">
                  {staffId
                    ? (qualifiedStaff.find((m) => m.id === staffId)?.name ?? "—")
                    : "Cualquiera disponible"}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Duración</dt>
              <dd className="text-slate-800">
                {service ? `${service.durationMinutes} min` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Fecha</dt>
              <dd className="text-right text-slate-800">
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
