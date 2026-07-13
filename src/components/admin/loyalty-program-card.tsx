"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Configuración de la tarjeta de sellos: cada N citas completadas, un cupón
// personal de descuento. La acumulación y el premio son automáticos.
export function LoyaltyProgramCard({
  initial,
}: {
  initial: {
    active: boolean;
    stampsRequired: number;
    rewardPercent: number;
    rewardValidityDays: number;
  } | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initial?.active ?? false);
  const [stampsRequired, setStampsRequired] = useState(
    initial?.stampsRequired ?? 5,
  );
  const [rewardPercent, setRewardPercent] = useState(
    initial?.rewardPercent ?? 20,
  );
  const [validityDays, setValidityDays] = useState(
    initial?.rewardValidityDays ?? 180,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(nextActive = active) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/loyalty", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        active: nextActive,
        stampsRequired,
        rewardPercent,
        rewardValidityDays: validityDays,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo guardar la tarjeta de sellos");
      return;
    }
    setActive(nextActive);
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Stamp className="h-4 w-4 text-ink-muted" aria-hidden />
          Tarjeta de sellos
        </h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void save(!active)}
        >
          {active ? "Desactivar" : "Activar"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Fideliza sin esfuerzo: cada cita completada añade un sello y, al llenar
        la tarjeta, el cliente recibe automáticamente un cupón personal de
        descuento (un solo uso). El progreso se ve en “Mis citas” y en tu
        página pública.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-ink-soft">
          Sellos para el premio
          <input
            type="number"
            min={2}
            max={50}
            value={stampsRequired}
            onChange={(e) => setStampsRequired(Number(e.target.value))}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="text-sm text-ink-soft">
          Premio (% descuento)
          <input
            type="number"
            min={1}
            max={100}
            value={rewardPercent}
            onChange={(e) => setRewardPercent(Number(e.target.value))}
            className="input mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-xs text-ink-muted">
            100% = una cita gratis
          </span>
        </label>
        <label className="text-sm text-ink-soft">
          Validez del cupón (días)
          <input
            type="number"
            min={7}
            max={730}
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
            className="input mt-1 w-full text-sm"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success-strong">
            <Check className="h-4 w-4" aria-hidden />
            Guardado{active ? " · activa" : " · desactivada"}
          </span>
        )}
      </div>
    </Card>
  );
}
