"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { WEEKDAYS_ES, WEEKDAY_ORDER } from "@/lib/weekdays";

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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input
            name="name"
            required
            minLength={2}
            defaultValue={initial?.name}
            className="input"
          />
        </div>
        <div>
          <label className="label">Color en la agenda</label>
          <input
            name="color"
            type="color"
            defaultValue={initial?.color ?? "#0ea5e9"}
            className="h-10 w-16 cursor-pointer rounded border border-slate-300"
          />
        </div>
        <div>
          <label className="label">Email (opcional)</label>
          <input
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">Teléfono (opcional)</label>
          <input
            name="phone"
            defaultValue={initial?.phone ?? ""}
            className="input"
          />
        </div>
      </div>

      <div>
        <p className="label">Servicios que realiza</p>
        <p className="mb-2 text-xs text-slate-400">
          Sin marcar ninguno, realiza todos los servicios.
        </p>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                serviceIds.includes(s.id)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
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
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={useOwnHours}
            onChange={(e) => setUseOwnHours(e.target.checked)}
          />
          Horario propio (si no, hereda el horario del negocio)
        </label>
        {useOwnHours && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
            {WEEKDAY_ORDER.map((weekday) => {
              const dayRanges = ownHours
                .map((r, index) => ({ ...r, index }))
                .filter((r) => r.weekday === weekday);
              return (
                <div key={weekday} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-medium text-slate-600">
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
                        className="input max-w-28 py-1"
                      />
                      –
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
                        className="input max-w-28 py-1"
                      />
                      <button
                        type="button"
                        className="px-1 text-xs text-rose-600"
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
                    className="text-xs text-indigo-600 hover:underline"
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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Guardando…" : initial ? "Guardar cambios" : "Añadir al equipo"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
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

  function refresh() {
    setEditing(null);
    setCreating(false);
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
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + Añadir empleado
        </button>
      )}
      {creating && (
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-900">Nuevo empleado</h2>
          <StaffForm
            services={services}
            onDone={refresh}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="space-y-3">
        {staff.map((member) => (
          <div key={member.id} className="card">
            {editing === member.id ? (
              <StaffForm
                initial={member}
                services={services}
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: member.color }}
                    aria-hidden
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">
                      {member.name}
                      {!member.active && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          Inactivo
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">
                      {serviceNames(member.serviceIds)}
                      {member.hours.length > 0
                        ? " · horario propio"
                        : " · horario del negocio"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setEditing(member.id)}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => toggleActive(member)}
                  >
                    {member.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {staff.length === 0 && (
          <p className="card text-sm text-slate-500">
            Sin equipo definido, el negocio funciona con una única agenda
            (capacidad 1). Añade empleados para atender varias citas a la vez.
          </p>
        )}
      </div>
    </div>
  );
}
