"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Store,
  Tag,
  User,
  Wallet,
} from "lucide-react";
import { formatCents } from "@/lib/money";
import { fmt, intlLocale, type Dict, type Locale } from "@/lib/i18n/shared";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CardSetup } from "./card-setup";

type BookingDict = Dict["booking"];

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
  locale: Locale;
  t: BookingDict;
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

/** Quita un posible prefijo numérico ("1. ", "2) ") de la etiqueta de paso. */
function stepLabel(label: string): string {
  return label.replace(/^\s*\d+\s*[.)]?\s*/, "");
}

export function BookingWizard({
  business,
  services,
  staff,
  initialServiceId,
  isLoggedIn,
  userHasPhone,
  locale,
  t,
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
  const [couponCode, setCouponCode] = useState("");
  const [myPackages, setMyPackages] = useState<
    Array<{ id: string; name: string; remainingSessions: number }>
  >([]);
  const [usePackageId, setUsePackageId] = useState("");
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

  // Bonos canjeables del cliente para el servicio elegido
  useEffect(() => {
    if (!isLoggedIn || !serviceId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/me/packages?businessId=${encodeURIComponent(business.id)}&serviceId=${encodeURIComponent(serviceId)}`,
      );
      const json = await res.json().catch(() => ({ packages: [] }));
      if (!cancelled) {
        setMyPackages(res.ok ? json.packages : []);
        setUsePackageId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, serviceId, business.id]);

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
      if (!res.ok) throw new Error(json.error ?? t.availabilityError);
      setSlots(json.slots);
    } catch (e) {
      setSlots([]);
      setError(e instanceof Error ? e.message : t.networkError);
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
          clientPackageId: usePackageId || undefined,
          couponCode:
            !usePackageId && couponCode.trim() ? couponCode.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // El hueco pudo ocuparse mientras se decidía: recarga disponibilidad
        if (json.code === "SLOT_TAKEN" || json.code === "SLOT_UNAVAILABLE") {
          await loadSlots();
        }
        throw new Error(json.error ?? t.bookingError);
      }
      setConfirmed({
        startAt: json.appointment.startAt,
        service: json.appointment.service,
        staff: json.appointment.staff,
        freeCancellationUntil: json.appointment.freeCancellationUntil,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  if (confirmed) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-strong">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          {t.confirmedTitle}
        </h2>
        <p className="mt-2 text-ink-soft">
          {confirmed.service}
          {confirmed.staff ? fmt(t.confirmedWith, { staff: confirmed.staff }) : ""} ·{" "}
          {dateFormatter.format(new Date(confirmed.startAt))}
        </p>
        <p className="mt-2 text-sm text-ink-muted">{t.confirmedNotice}</p>
        <div className="mt-4 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
          {fmt(t.freeCancelUntil, {
            deadline: dateFormatter.format(
              new Date(confirmed.freeCancellationUntil),
            ),
          })}
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/mis-citas" className="btn-primary">
            {t.seeMyAppointments}
          </Link>
          <Link href={`/b/${business.slug}`} className="btn-secondary">
            {t.backToBusiness}
          </Link>
        </div>
      </Card>
    );
  }

  const steps = [
    stepLabel(t.stepService),
    ...(hasStaff ? [stepLabel(t.stepStaff)] : []),
    stepLabel(t.stepDate),
    stepLabel(t.stepConfirm),
  ];
  // Paso activo según lo que falte por elegir: servicio → hueco → confirmación
  const currentStep = !serviceId
    ? 0
    : !selectedSlot
      ? steps.length - 2
      : steps.length - 1;

  const canBook =
    isLoggedIn && !!selectedSlot && (cardSaved || !business.requireCardToBook);

  return (
    <div className="space-y-6">
      <Card className="px-4 py-4 sm:px-6">
        <Stepper steps={steps} current={currentStep} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Servicio */}
          <Card>
            <SectionHeader as="h2" title={stepLabel(t.stepService)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setStaffId("");
                  }}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    s.id === serviceId
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-surface hover:border-brand-300",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="shrink-0 text-sm font-semibold text-ink">
                      {formatCents(s.priceCents, business.currency)}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {s.durationMinutes} min
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* Profesional (solo negocios con equipo) */}
          {hasStaff && (
            <Card>
              <SectionHeader as="h2" title={stepLabel(t.stepStaff)} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setStaffId("")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    staffId === ""
                      ? "border-brand-600 bg-brand-50 text-brand-300 ring-1 ring-brand-600"
                      : "border-border bg-surface text-ink-soft hover:border-brand-300",
                  )}
                >
                  {t.anyStaff}
                </button>
                {qualifiedStaff.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setStaffId(m.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      staffId === m.id
                        ? "border-brand-600 bg-brand-50 text-brand-300 ring-1 ring-brand-600"
                        : "border-border bg-surface text-ink-soft hover:border-brand-300",
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: m.color }}
                      aria-hidden
                    />
                    {m.name}
                  </button>
                ))}
              </div>
              {qualifiedStaff.length === 0 && (
                <p className="mt-3 rounded-lg bg-surface-3 px-3 py-2.5 text-sm text-ink-muted">
                  {t.noStaffForService}
                </p>
              )}
            </Card>
          )}

          {/* Fecha y hora */}
          <Card>
            <SectionHeader as="h2" title={stepLabel(t.stepDate)} />
            <Field label={t.date} htmlFor="fecha" className="mt-4">
              <Input
                id="fecha"
                type="date"
                className="max-w-xs"
                value={dateISO}
                min={todayISO()}
                max={addDays(todayISO(), business.maxAdvanceBookingDays)}
                onChange={(e) => setDateISO(e.target.value)}
              />
            </Field>
            <div className="mt-4">
              {loadingSlots && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  <span className="sr-only">{t.searchingSlots}</span>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-9" />
                  ))}
                </div>
              )}
              {!loadingSlots && slots && slots.length === 0 && (
                <p className="rounded-lg bg-surface-3 px-3 py-2.5 text-sm text-ink-muted">
                  {t.noSlots}
                </p>
              )}
              {!loadingSlots && slots && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {slots.map((slot) => (
                    <button
                      key={slot.startAt}
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition-colors",
                        selectedSlot?.startAt === slot.startAt
                          ? "border-brand-600 bg-brand-50 text-brand-300 ring-1 ring-brand-600"
                          : "border-border bg-surface text-ink-soft hover:border-brand-300",
                      )}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Confirmación */}
          <Card>
            <SectionHeader as="h2" title={stepLabel(t.stepConfirm)} />

            {isLoggedIn && !userHasPhone && (
              <Field label={t.phoneLabel} htmlFor="telefono" className="mt-4">
                <Input
                  id="telefono"
                  type="tel"
                  className="max-w-xs"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            )}

            {/* Promoción: bono del cliente o cupón (excluyentes) */}
            {isLoggedIn && myPackages.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-success-soft p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-success-strong">
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={!!usePackageId}
                    onChange={(e) =>
                      setUsePackageId(e.target.checked ? myPackages[0].id : "")
                    }
                  />
                  {fmt(t.usePackage, {
                    name: myPackages[0].name,
                    n: myPackages[0].remainingSessions,
                  })}
                </label>
                {usePackageId && (
                  <p className="mt-1 text-xs text-success-strong">
                    {t.packageNote}
                  </p>
                )}
              </div>
            )}

            {isLoggedIn && !usePackageId && (
              <Field label={t.couponLabel} htmlFor="cupon" className="mt-4">
                <Input
                  id="cupon"
                  className="max-w-xs uppercase"
                  placeholder={t.couponPlaceholder}
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
              </Field>
            )}

            <Field label={t.notesLabel} htmlFor="notas" className="mt-4">
              <Textarea
                id="notas"
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {/* Tarjeta (solo si el negocio la exige) */}
            {isLoggedIn && business.requireCardToBook && (
              <div className="mt-4">
                <p className="label">{t.cardTitle}</p>
                <p className="mb-2 text-xs text-ink-muted">
                  {fmt(t.cardNote, { hours: business.cancellationWindowHours })}
                </p>
                {checkingCard ? (
                  <div>
                    <span className="sr-only">{t.cardChecking}</span>
                    <Skeleton className="h-10 w-full max-w-xs" />
                  </div>
                ) : cardSaved ? (
                  <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
                    {t.cardSaved}
                  </p>
                ) : (
                  <CardSetup onSaved={() => setCardSaved(true)} />
                )}
              </div>
            )}
          </Card>
        </div>

        <aside>
          <Card className="sticky top-6">
            <h2 className="font-semibold text-ink">{t.summary}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-ink-muted">
                  <Store className="h-4 w-4" aria-hidden />
                  {t.business}
                </dt>
                <dd className="text-right font-medium text-ink">
                  {business.name}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-ink-muted">
                  <Tag className="h-4 w-4" aria-hidden />
                  {t.service}
                </dt>
                <dd className="text-right font-medium text-ink">
                  {service?.name ?? "—"}
                </dd>
              </div>
              {hasStaff && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-ink-muted">
                    <User className="h-4 w-4" aria-hidden />
                    {t.staff}
                  </dt>
                  <dd className="text-right font-medium text-ink">
                    {staffId
                      ? (qualifiedStaff.find((m) => m.id === staffId)?.name ??
                        "—")
                      : t.anyStaff}
                  </dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-ink-muted">
                  <Clock className="h-4 w-4" aria-hidden />
                  {t.duration}
                </dt>
                <dd className="text-right font-medium text-ink">
                  {service ? `${service.durationMinutes} min` : "—"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-ink-muted">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  {t.dateLabel}
                </dt>
                <dd className="text-right font-medium text-ink">
                  {selectedSlot
                    ? dateFormatter.format(new Date(selectedSlot.startAt))
                    : dateISO}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                <dt className="flex shrink-0 items-center gap-2 font-medium text-ink-soft">
                  <Wallet className="h-4 w-4" aria-hidden />
                  {t.price}
                </dt>
                <dd className="text-right font-semibold text-ink">
                  {usePackageId ? (
                    <>
                      <span className="mr-1 font-normal text-ink-muted line-through">
                        {service
                          ? formatCents(service.priceCents, business.currency)
                          : ""}
                      </span>
                      {t.packagePrice}
                    </>
                  ) : service ? (
                    formatCents(service.priceCents, business.currency)
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {!usePackageId && couponCode.trim() && (
                <p className="text-xs text-ink-muted">
                  {fmt(t.couponWillValidate, { code: couponCode.trim() })}
                </p>
              )}
            </dl>
            <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-strong">
              {fmt(t.policyShort, {
                hours: business.cancellationWindowHours,
                percent: business.lateCancellationFeePercent,
              })}
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-strong">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            )}
            {isLoggedIn ? (
              <button
                className="btn-primary mt-4 w-full"
                disabled={!canBook || submitting}
                onClick={book}
              >
                {submitting
                  ? t.booking
                  : !selectedSlot
                    ? t.chooseSlot
                    : business.requireCardToBook && !cardSaved
                      ? t.saveCardFirst
                      : service
                        ? fmt(t.bookCta, {
                            service: service.name,
                            slot: selectedSlot.label,
                          })
                        : t.stepConfirm}
              </button>
            ) : (
              <div className="mt-4 rounded-lg bg-surface-3 p-3 text-sm text-ink-soft">
                <Link
                  href={`/login?next=/b/${business.slug}/reservar${serviceId ? `?servicio=${serviceId}` : ""}`}
                  className="font-medium text-brand-300 hover:text-brand-200"
                >
                  {t.loginPrompt1}
                </Link>{" "}
                {t.loginPrompt2}{" "}
                <Link
                  href={`/register?next=/b/${business.slug}/reservar${serviceId ? `?servicio=${serviceId}` : ""}`}
                  className="font-medium text-brand-300 hover:text-brand-200"
                >
                  {t.loginPrompt3}
                </Link>{" "}
                {t.loginPrompt4}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
