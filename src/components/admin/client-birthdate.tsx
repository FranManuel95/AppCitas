"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";

// Cumpleaños en la ficha CRM: el negocio lo apunta para clientes de
// mostrador/importados (habilita el segmento de campañas "cumpleaños").
// Si el cliente ya aportó su fecha desde su cuenta, no se puede pisar
// (el backend responde BIRTHDATE_LOCKED) y solo se muestra.
export function ClientBirthdate({
  clientId,
  birthDate,
  editable,
}: {
  clientId: string;
  birthDate: string | null; // "YYYY-MM-DD"
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(birthDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = birthDate
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${birthDate}T00:00:00.000Z`))
    : null;

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo guardar");
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (!editable) {
    return label ? (
      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
        <Cake className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        Cumpleaños: {label}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Cake className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
      {!editing ? (
        <>
          <span className="text-ink-soft">
            {label ? `Cumpleaños: ${label}` : "Sin cumpleaños apuntado"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(birthDate ?? "");
              setEditing(true);
            }}
          >
            {label ? "Editar" : "Añadir"}
          </Button>
        </>
      ) : (
        <>
          <input
            type="date"
            className="input h-8 w-auto py-1 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            aria-label="Fecha de nacimiento"
          />
          <Button
            size="sm"
            disabled={busy || value === ""}
            onClick={() => save(value)}
          >
            Guardar
          </Button>
          {birthDate && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
              Quitar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </>
      )}
      {error && (
        <span className="flex items-center gap-1 text-xs text-danger-strong">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
