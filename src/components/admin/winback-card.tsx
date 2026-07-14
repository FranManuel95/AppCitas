"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

// Win-back automático: aviso "vuelve a reservar" N días después de la última
// cita completada sin cita posterior. Se guarda en Business.winbackDays
// (null = desactivado) vía el PATCH de ajustes.
export function WinbackCard({
  initialDays,
  disabled,
}: {
  initialDays: number | null;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialDays !== null);
  const [days, setDays] = useState(initialDays ?? 45);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winbackDays: enabled ? days : null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(
      res.ok
        ? { kind: "ok", text: "Guardado" }
        : { kind: "error", text: json.error ?? "No se pudo guardar" },
    );
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
        <RotateCcw className="h-4 w-4 text-ink-muted" aria-hidden />
        Vuelve a reservar (win-back)
      </h2>
      <p className="mt-1.5 text-sm text-ink-muted">
        Aviso automático a los clientes que no han vuelto a reservar pasado un
        tiempo desde su última cita. Respeta la baja de promociones de cada
        cliente y lleva enlace de baja. El texto se personaliza en
        Notificaciones.
      </p>
      <div className="mt-4 space-y-3">
        <Switch
          name="winbackEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          label="Activar el aviso automático"
          disabled={disabled || busy}
        />
        {enabled && (
          <Field label="Días desde la última cita" htmlFor="winback-days">
            <Input
              id="winback-days"
              type="number"
              min={7}
              max={365}
              className="max-w-32 tabular-nums"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={disabled || busy}
            />
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={disabled || busy} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          {message && (
            <span
              className={`flex items-center gap-1 text-xs ${
                message.kind === "ok" ? "text-ink-soft" : "text-danger-strong"
              }`}
            >
              {message.kind === "ok" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              )}
              {message.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
