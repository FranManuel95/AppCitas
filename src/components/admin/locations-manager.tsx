"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, MapPin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LocationDTO {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  staffCount: number;
}

// Gestión de sedes (patrón servicios). La sede filtra el equipo en la
// reserva; los horarios siguen siendo por negocio/empleado.
export function LocationsManager({ locations }: { locations: LocationDTO[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        address: String(form.get("address") ?? "").trim() || null,
        phone: String(form.get("phone") ?? "").trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo crear la sede");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function toggle(location: LocationDTO) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/locations/${location.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !location.active }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo actualizar la sede");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nueva sede
        </Button>
      )}

      {creating && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create(new FormData(e.currentTarget));
            }}
          >
            <label className="text-sm text-ink-soft">
              Nombre
              <input name="name" required minLength={2} maxLength={80} className="input mt-1 w-full text-sm" placeholder="Centro" />
            </label>
            <label className="text-sm text-ink-soft">
              Dirección
              <input name="address" maxLength={200} className="input mt-1 w-full text-sm" placeholder="Calle Mayor 1" />
            </label>
            <label className="text-sm text-ink-soft">
              Teléfono
              <input name="phone" maxLength={30} className="input mt-1 w-full text-sm" />
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Creando…" : "Crear sede"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="space-y-3">
        {locations.map((l) => (
          <Card
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-1.5 font-medium text-ink">
                  <MapPin className="h-4 w-4 text-ink-muted" aria-hidden />
                  {l.name}
                </p>
                {!l.active && <Badge tone="neutral">Inactiva</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {[l.address, l.phone].filter(Boolean).join(" · ") || "—"}
                {" · "}
                {l.staffCount} empleado{l.staffCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => toggle(l)}
            >
              {l.active ? "Desactivar" : "Activar"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
