"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { type Dict } from "@/lib/i18n/shared";

// Autoservicio RGPD del cliente: descargar sus datos (enlace nativo al endpoint
// que responde con Content-Disposition) y eliminar la cuenta con confirmación
// explícita. Tras el borrado la sesión ya no es válida → se va a la portada.
export function MyDataPanel({ t }: { t: Dict["myData"] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/delete", { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? t.deleteError);
      setBusy(false);
      return;
    }
    // Sesión invalidada: redirige a la portada y refresca el estado del árbol.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-5">
      <p className="text-sm text-ink-soft">{t.description}</p>

      <div>
        <a
          href="/api/me/export"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <Download className="h-4 w-4" aria-hidden />
          {t.exportCta}
        </a>
        <p className="mt-2 text-xs text-ink-muted">{t.exportHint}</p>
      </div>

      <div className="border-t border-border pt-4">
        {!confirming ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              {t.deleteCta}
            </Button>
            <p className="mt-2 text-xs text-ink-muted">{t.deleteHint}</p>
          </>
        ) : (
          <div className="rounded-lg border border-danger/30 bg-danger-soft p-4">
            <p className="flex items-start gap-2 text-sm text-danger-strong">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.deleteHint}</span>
            </p>
            {error && <p className="mt-2 text-sm text-danger-strong">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={confirmDelete}
              >
                {busy ? t.deleting : t.deleteConfirm}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
