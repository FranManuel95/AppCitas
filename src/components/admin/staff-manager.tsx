"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  AlertCircle,
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
import { WEEKDAYS_ES, WEEKDAY_ORDER } from "@/lib/weekdays";
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
}

interface ServiceOption {
  id: string;
  name: string;
}

function StaffForm({
  initial,
  services,
  onDone,
  onCancel,
}: {
  initial?: StaffDTO;
  services: ServiceOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownHours, setOwnHours] = useState<HourRange[]>(initial?.hours ?? []);
  const [useOwnHours, setUseOwnHours] = useState(
    (initial?.hours.length ?? 0) > 0,
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    initial?.serviceIds ?? [],
  );

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
    const body = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      color: String(form.get("color") ?? "#0ea5e9"),
      serviceIds,
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
      setError(json.error ?? "No se pudo guardar");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`${uid}-name`}>
          <Input
            id={`${uid}-name`}
            name="name"
            required
            minLength={2}
            defaultValue={initial?.name}
          />
        </Field>
        <Field label="Color en la agenda" htmlFor={`${uid}-color`}>
          <input
            id={`${uid}-color`}
            name="color"
            type="color"
            defaultValue={initial?.color ?? "#0ea5e9"}
            className="h-10 w-16 cursor-pointer rounded-lg border border-border-strong bg-surface p-1"
          />
        </Field>
        <Field label="Email (opcional)" htmlFor={`${uid}-email`}>
          <Input
            id={`${uid}-email`}
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
          />
        </Field>
        <Field label="Teléfono (opcional)" htmlFor={`${uid}-phone`}>
          <Input
            id={`${uid}-phone`}
            name="phone"
            defaultValue={initial?.phone ?? ""}
          />
        </Field>
      </div>

      <div>
        <p className="label">Servicios que realiza</p>
        <p className="mb-2 text-xs text-ink-muted">
          Sin marcar ninguno, realiza todos los servicios.
        </p>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                serviceIds.includes(s.id)
                  ? "border-brand-500 bg-brand-50 text-brand-300"
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
          label="Horario propio (si no, hereda el horario del negocio)"
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
                    {WEEKDAYS_ES[weekday]}
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
                    className="text-xs font-medium text-brand-300 hover:underline"
                    onClick={() =>
                      setOwnHours((h) => [
                        ...h,
                        { weekday, openTime: "09:00", closeTime: "18:00" },
                      ])
                    }
                  >
                    + tramo
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
          {busy ? "Guardando…" : initial ? "Guardar cambios" : "Añadir al equipo"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function StaffManager({
  staff,
  services,
}: {
  staff: StaffDTO[];
  services: ServiceOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

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
      setInviteMessage(json.error ?? "No se pudo enviar la invitación");
      return;
    }
    setInviteMessage(
      `Invitación enviada a ${json.email}: recibirá un enlace para establecer su contraseña.`,
    );
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
    if (ids.length === 0) return "Todos los servicios";
    return services
      .filter((s) => ids.includes(s.id))
      .map((s) => s.name)
      .join(", ");
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}>+ Añadir empleado</Button>
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
            Nuevo empleado
          </h2>
          <StaffForm
            services={services}
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
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {member.name}
                      {!member.active && (
                        <Badge tone="neutral">Inactivo</Badge>
                      )}
                      {member.hasAccess && (
                        <Badge tone="success" icon={KeyRound}>
                          Portal activo
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {serviceNames(member.serviceIds)}
                      {member.hours.length > 0
                        ? " · horario propio"
                        : " · horario del negocio"}
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
                      Dar acceso
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(member.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Editar
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
                    {member.active ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {staff.length === 0 && (
          <EmptyState
            icon={Users}
            title="Sin equipo definido, el negocio funciona con una única agenda (capacidad 1)."
            description="Añade empleados para atender varias citas a la vez."
          />
        )}
      </div>
    </div>
  );
}
