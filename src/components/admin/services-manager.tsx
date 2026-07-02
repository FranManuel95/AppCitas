"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatCents } from "@/lib/money";

interface ServiceDTO {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  color: string;
  active: boolean;
}

function ServiceForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: ServiceDTO;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || undefined,
      durationMinutes: Number(form.get("durationMinutes")),
      priceCents: Math.round(Number(form.get("price")) * 100),
      color: String(form.get("color") ?? "#6366f1"),
    };

    const res = await fetch(
      initial ? `/api/admin/services/${initial.id}` : "/api/admin/services",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo guardar el servicio");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Nombre</label>
        <input
          name="name"
          required
          minLength={2}
          defaultValue={initial?.name}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Descripción (opcional)</label>
        <input
          name="description"
          defaultValue={initial?.description ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Duración (minutos)</label>
        <input
          name="durationMinutes"
          type="number"
          min={5}
          max={600}
          step={5}
          required
          defaultValue={initial?.durationMinutes ?? 30}
          className="input"
        />
      </div>
      <div>
        <label className="label">Precio (€)</label>
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={initial ? initial.priceCents / 100 : ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Color en la agenda</label>
        <input
          name="color"
          type="color"
          defaultValue={initial?.color ?? "#6366f1"}
          className="h-10 w-16 cursor-pointer rounded border border-slate-300"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear servicio"}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function ServicesManager({
  services,
  currency,
}: {
  services: ServiceDTO[];
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function toggleActive(service: ServiceDTO) {
    await fetch(`/api/admin/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + Nuevo servicio
        </button>
      )}
      {creating && (
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-900">Nuevo servicio</h2>
          <ServiceForm onDone={refresh} onCancel={() => setCreating(false)} />
        </div>
      )}

      <div className="space-y-3">
        {services.map((s) => (
          <div key={s.id} className="card">
            {editing === s.id ? (
              <ServiceForm
                initial={s}
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <div>
                    <p className="font-medium text-slate-900">
                      {s.name}
                      {!s.active && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          Inactivo
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">
                      {s.durationMinutes} min ·{" "}
                      {formatCents(s.priceCents, currency)}
                      {s.description ? ` · ${s.description}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setEditing(s.id)}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => toggleActive(s)}
                  >
                    {s.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {services.length === 0 && (
          <p className="text-sm text-slate-500">
            Aún no hay servicios. Crea el primero para que tus clientes puedan
            reservar.
          </p>
        )}
      </div>
    </div>
  );
}
