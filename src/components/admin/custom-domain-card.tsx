"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Dominio propio (Pro): la raíz del dominio sirve la página pública del
// negocio. Además hay que añadir el dominio en Vercel (DEPLOY.md).
export function CustomDomainCard({
  initial,
  isPro,
}: {
  initial: string | null;
  isPro: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customDomain: value.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo guardar el dominio");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Globe className="h-4 w-4 text-ink-muted" aria-hidden />
        Dominio propio
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Con tu dominio (p. ej. <code>reservas.tunegocio.com</code>), la portada
        pasa a ser tu página de reservas. Apunta un CNAME a la app y pide que
        se añada el dominio en Vercel (ver DEPLOY.md).
        {!isPro && " Disponible en el plan Pro."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="reservas.tunegocio.com"
          disabled={!isPro}
          className="input min-w-64 flex-1 text-sm"
        />
        <Button size="sm" disabled={busy || !isPro} onClick={save}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success-strong">
            <Check className="h-4 w-4" aria-hidden />
            Guardado
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </Card>
  );
}
