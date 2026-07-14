"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarOff,
  Info,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Send,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { StaffTimeOffPanel } from "@/components/admin/staff-timeoff";
import { WEEKDAY_ORDER, weekdayNames } from "@/lib/weekdays";
import { fmt, type Dict, type Locale } from "@/lib/i18n/shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

interface HourRange {
  weekday: number;
  openTime: string;
  closeTime: string;
}

interface StaffDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  color: string;
  active: boolean;
  hasAccess: boolean;
  hours: HourRange[];
  serviceIds: string[];
  locationId: string | null;
  commissionPercent: number | null;
}

interface ServiceOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
}

export interface StaffManagerLabels {
  equipo: Pick<
    Dict["admin"]["equipo"],
    | "addStaff"
    | "newStaff"
    | "nameLabel"
    | "colorLabel"
    | "emailLabel"
    | "phoneLabel"
    | "servicesPerformed"
    | "servicesPerformedHint"
    | "ownHoursLabel"
    | "addRange"
    | "submitCreate"
    | "inviteError"
    | "inviteSent"
    | "allServices"
    | "portalActive"
    | "ownScheduleSuffix"
    | "businessScheduleSuffix"
    | "giveAccess"
    | "emptyTitle"
    | "emptyDescription"
    | "timeOffCta"
    | "timeOffTitle"
    | "timeOffHint"
    | "timeOffFrom"
    | "timeOffTo"
    | "timeOffReason"
    | "timeOffAdd"
    | "timeOffEmpty"
    | "timeOffDelete"
    | "timeOffError"
  >;
  common: Pick<
    Dict["admin"]["common"],
    | "edit"
    | "cancel"
    | "activate"
    | "deactivate"
    | "saving"
    | "saveChanges"
    | "inactive"
    | "saveError"
  >;
}

function StaffForm({
  initial,
  services,
  locations,
  locale,
  labels,
  onDone,
  onCancel,
}: {
  initial?: StaffDTO;
  services: ServiceOption[];
  locations: LocationOption[];
  locale: Locale;
  labels: StaffManagerLabels;
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const weekdays = weekdayNames(locale);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownHours, setOwnHours] = useState<HourRange[]>(initial?.hours ?? []);
  const [useOwnHours, setUseOwnHours] = useState(
    (initial?.hours.length ?? 0) > 0,
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    initial?.serviceIds ?? [],
  );
  // Sede asignada ("" = todas las sedes)
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");

  function toggleService(id: string) {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const rawCommission = String(form.get("commissionPercent") ?? "").trim();
    const body = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      color: String(form.get("color") ?? "#0ea5e9"),
      serviceIds,
      locationId: locationId || null,
      commissionPercent: rawCommission === "" ? null : Number(rawCommission),
      hours: useOwnHours ? ownHours : [],
    };

    const res = await fetch(
      initial ? `/api/admin/staff/${initial.id}` : "/api/admin/staff",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.common.saveError);
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.equipo.nameLabel} htmlFor={`${uid}-name`}>
          <Input
            id={`${uid}-name`}
            name="name"
            required
            minLength={2}
            defaultValue={initial?.name}
          />
        </Field>
        <Field label={labels.equipo.colorLabel} htmlFor={`${uid}-color`}>
          <input
            id={`${uid}-color`}
            name="color"
            type="color"
            defaultValue={initial?.color ?? "#0ea5e9"}
            className="h-10 w-16 cursor-pointer rounded-lg border border-border-strong bg-surface p-1"
          />
        </Field>
        <Field label={labels.equipo.emailLabel} htmlFor={`${uid}-email`}>
          <Input
            id={`${uid}-email`}
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
          />
        </Field>
        <Field label={labels.equipo.phoneLabel} htmlFor={`${uid}-phone`}>
          <Input
            id={`${uid}-phone`}
            name="phone"
            defaultValue={initial?.phone ?? ""}
          />
        </Field>
        <Field
          label="Comisión (%)"
          htmlFor={`${uid}-commission`}
          hint="Solo informativo: alimenta el informe de ingresos por empleado. Vacío = sin comisión."
        >
          <Input
            id={`${uid}-commission`}
            name="commissionPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={initial?.commissionPercent ?? ""}
            className="tabular-nums"
          />
        </Field>
        {locations.length > 0 && (
          <Field label="Sede" htmlFor={`${uid}-location`}>
            <select
              id={`${uid}-location`}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="input w-full text-sm"
            >
              <option value="">Todas las sedes</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div>
        <p className="label">{labels.equipo.servicesPerformed}</p>
        <p className="mb-2 text-xs text-ink-muted">
          {labels.equipo.servicesPerformedHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                serviceIds.includes(s.id)
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-border-strong bg-surface text-ink-soft hover:bg-surface-2",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={serviceIds.includes(s.id)}
                onChange={() => toggleService(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Switch
          checked={useOwnHours}
          onChange={(e) => setUseOwnHours(e.target.checked)}
          label={labels.equipo.ownHoursLabel}
        />
        {useOwnHours && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface-3/50 p-3">
            {WEEKDAY_ORDER.map((weekday) => {
              const dayRanges = ownHours
                .map((r, index) => ({ ...r, index }))
                .filter((r) => r.weekday === weekday);
              return (
                <div key={weekday} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-medium text-ink-soft">
                    {weekdays[weekday]}
                  </span>
                  {dayRanges.map((r) => (
                    <span key={r.index} className="flex items-center gap-1">
                      <input
                        type="time"
                        value={r.openTime}
                        onChange={(e) =>
                          setOwnHours((h) =>
                            h.map((x, i) =>
                              i === r.index
                                ? { ...x, openTime: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="input max-w-28 py-1 tabular-nums"
                      />
                      <span className="text-ink-muted" aria-hidden>
                        –
                      </span>
                      <input
                        type="time"
                        value={r.closeTime}
                        onChange={(e) =>
                          setOwnHours((h) =>
                            h.map((x, i) =>
                              i === r.index
                                ? { ...x, closeTime: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="input max-w-28 py-1 tabular-nums"
                      />
                      <button
                        type="button"
                        className="rounded px-1 text-xs text-danger-strong transition-colors hover:bg-danger-soft"
                        onClick={() =>
                          setOwnHours((h) => h.filter((_, i) => i !== r.index))
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-700 hover:underline"
                    onClick={() =>
                      setOwnHours((h) => [
                        ...h,
                        { weekday, openTime: "09:00", closeTime: "18:00" },
                      ])
                    }
                  >
                    {labels.equipo.addRange}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={busy}>
          {busy
            ? labels.common.saving
            : initial
              ? labels.common.saveChanges
              : labels.equipo.submitCreate}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {labels.common.cancel}
        </Button>
      </div>
    </form>
  );
}

export function StaffManager({
  staff,
  services,
  locations,
  locale,
  labels,
}: {
  staff: StaffDTO[];
  services: ServiceOption[];
  locations: LocationOption[];
  locale: Locale;
  labels: StaffManagerLabels;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [timeOffOpen, setTimeOffOpen] = useState<string | null>(null);

  function refresh() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function invite(member: StaffDTO) {
    setInviteMessage(null);
    const res = await fetch(`/api/admin/staff/${member.id}/access`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteMessage(json.error ?? labels.equipo.inviteError);
      return;
    }
    setInviteMessage(fmt(labels.equipo.inviteSent, { email: json.email }));
    router.refresh();
  }

  async function toggleActive(member: StaffDTO) {
    await fetch(`/api/admin/staff/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !member.active }),
    });
    router.refresh();
  }

  function serviceNames(ids: string[]): string {
    if (ids.length === 0) return labels.equipo.allServices;
    return services
      .filter((s) => ids.includes(s.id))
      .map((s) => s.name)
      .join(", ");
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}>
          {labels.equipo.addStaff}
        </Button>
      )}
      {inviteMessage && (
        <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info-strong">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {inviteMessage}
        </p>
      )}
      {creating && (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink">
            {labels.equipo.newStaff}
          </h2>
          <StaffForm
            services={services}
            locations={locations}
            locale={locale}
            labels={labels}
            onDone={refresh}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      <div className="space-y-3">
        {staff.map((member) => (
          <Card key={member.id} className={cn(!member.active && "bg-surface-3/40")}>
            {editing === member.id ? (
              <StaffForm
                initial={member}
                services={services}
                locations={locations}
                locale={locale}
                labels={labels}
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {member.name}
                      {!member.active && (
                        <Badge tone="neutral">{labels.common.inactive}</Badge>
                      )}
                      {member.hasAccess && (
                        <Badge tone="success" icon={KeyRound}>
                          {labels.equipo.portalActive}
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {serviceNames(member.serviceIds)}
                      {member.hours.length > 0
                        ? labels.equipo.ownScheduleSuffix
                        : labels.equipo.businessScheduleSuffix}
                    </p>
                    {(member.email || member.phone) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                        {member.email && (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {member.email}
                          </span>
                        )}
                        {member.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {member.phone}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!member.hasAccess && member.email && member.active && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => invite(member)}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      {labels.equipo.giveAccess}
                    </Button>
                  )}
                  {member.active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={timeOffOpen === member.id}
                      onClick={() =>
                        setTimeOffOpen((prev) =>
                          prev === member.id ? null : member.id,
                        )
                      }
                    >
                      <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                      {labels.equipo.timeOffCta}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(member.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {labels.common.edit}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={
                      member.active
                        ? "text-danger-strong hover:bg-danger-soft"
                        : undefined
                    }
                    onClick={() => toggleActive(member)}
                  >
                    {member.active ? (
                      <UserX className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {member.active ? labels.common.deactivate : labels.common.activate}
                  </Button>
                </div>
              </div>
              {timeOffOpen === member.id && (
                <StaffTimeOffPanel
                  staffId={member.id}
                  labels={labels.equipo}
                />
              )}
              </>
            )}
          </Card>
        ))}
        {staff.length === 0 && (
          <EmptyState
            icon={Users}
            title={labels.equipo.emptyTitle}
            description={labels.equipo.emptyDescription}
          />
        )}
      </div>
    </div>
  );
}
