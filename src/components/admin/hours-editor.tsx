"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WEEKDAYS_ES, WEEKDAY_ORDER } from "@/lib/weekdays";

interface HourRange {
  weekday: number;
  openTime: string;
  closeTime: string;
}

interface ClosureDTO {
  id: string;
  date: string;
  reason: string | null;
}

export function HoursEditor({
  initialHours,
  closures,
}: {
  initialHours: HourRange[];
  closures: ClosureDTO[];
}) {
  const router = useRouter();
  const [hours, setHours] = useState<HourRange[]>(initialHours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function addRange(weekday: number) {
    setHours((h) => [
      ...h,
      { weekday, openTime: "09:00", closeTime: "18:00" },
    ]);
  }

  function updateRange(index: number, patch: Partial<HourRange>) {
    setHours((h) => h.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRange(index: number) {
    setHours((h) => h.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo guardar" });
    } else {
      setMessage({ kind: "ok", text: "Horario guardado" });
      router.refresh();
    }
    setSaving(false);
  }

  async function addClosure(formData: FormData) {
    const date = String(formData.get("date") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const res = await fetch("/api/admin/closures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo añadir" });
      return;
    }
    setMessage(null);
    router.refresh();
  }

  async function removeClosure(id: string) {
    await fetch("/api/admin/closures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-semibold text-slate-900">Horario semanal</h2>
        <p className="text-xs text-slate-500">
          Varios tramos por día permitidos (p. ej. mañana y tarde).
        </p>
        <div className="mt-4 space-y-4">
          {WEEKDAY_ORDER.map((weekday) => {
            const dayRanges = hours
              .map((r, index) => ({ ...r, index }))
              .filter((r) => r.weekday === weekday);
            return (
              <div
                key={weekday}
                className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-3 last:border-0"
              >
                <span className="w-24 pt-2 text-sm font-medium text-slate-700">
                  {WEEKDAYS_ES[weekday]}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  {dayRanges.map((r) => (
                    <div key={r.index} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={r.openTime}
                        onChange={(e) =>
                          updateRange(r.index, { openTime: e.target.value })
                        }
                        className="input max-w-32"
                      />
                      <span className="text-slate-400">–</span>
                      <input
                        type="time"
                        value={r.closeTime}
                        onChange={(e) =>
                          updateRange(r.index, { closeTime: e.target.value })
                        }
                        className="input max-w-32"
                      />
                      <button
                        className="text-sm text-rose-600 hover:underline"
                        onClick={() => removeRange(r.index)}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  {dayRanges.length === 0 && (
                    <p className="pt-2 text-sm text-slate-400">Cerrado</p>
                  )}
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => addRange(weekday)}
                >
                  + Tramo
                </button>
              </div>
            );
          })}
        </div>
        {message && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              message.kind === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {message.text}
          </p>
        )}
        <button className="btn-primary mt-4" disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar horario"}
        </button>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-900">
          Cierres puntuales y festivos
        </h2>
        <p className="text-xs text-slate-500">
          Días concretos en los que no se aceptan reservas.
        </p>
        <form action={addClosure} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="closure-date">
              Fecha
            </label>
            <input
              id="closure-date"
              type="date"
              name="date"
              required
              className="input"
            />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="closure-reason">
              Motivo (opcional)
            </label>
            <input
              id="closure-reason"
              name="reason"
              placeholder="Festivo, vacaciones…"
              className="input"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Añadir cierre
          </button>
        </form>
        <ul className="mt-4 space-y-2">
          {closures.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                {c.date}
                {c.reason && (
                  <span className="text-slate-400"> · {c.reason}</span>
                )}
              </span>
              <button
                className="text-rose-600 hover:underline"
                onClick={() => removeClosure(c.id)}
              >
                Eliminar
              </button>
            </li>
          ))}
          {closures.length === 0 && (
            <li className="text-sm text-slate-400">
              No hay cierres programados.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
