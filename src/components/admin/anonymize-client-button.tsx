"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

// Derecho al olvido de un cliente de mostrador/invitado (sin cuenta): dos
// pasos para evitar borrados accidentales. Las citas se conservan anónimas.
export function AnonymizeClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/anonymize`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo anonimizar");
      setBusy(false);
      return;
    }
    router.push("/admin/clientes");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <Button
          variant="secondary"
          size="sm"
          className="text-danger-strong hover:bg-danger-soft"
          onClick={() => setConfirming(true)}
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
          Anonimizar datos (RGPD)
        </Button>
      ) : (
        <>
          <span className="text-xs text-ink-soft">
            Nombre, email y teléfono se borran para siempre; las citas quedan
            anónimas. ¿Seguro?
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="text-danger-strong hover:bg-danger-soft"
            disabled={busy}
            onClick={run}
          >
            Sí, anonimizar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirming(false)}
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
