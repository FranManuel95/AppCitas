"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Download, ShieldAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { type Dict } from "@/lib/i18n/shared";

// Autoservicio RGPD del cliente: descargar sus datos (enlace nativo al endpoint
// que responde con Content-Disposition) y eliminar la cuenta con confirmación
// explícita. Tras el borrado la sesión ya no es válida → se va a la portada.
// También edita el perfil ligero (cumpleaños → campañas de felicitación).
export function MyDataPanel({
  t,
  initialBirthDate = null,
}: {
  t: Dict["myData"];
  initialBirthDate?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState(initialBirthDate ?? "");
  const [birthSaved, setBirthSaved] = useState(false);
  const [savingBirth, setSavingBirth] = useState(false);

  async function saveBirthDate() {
    setSavingBirth(true);
    setBirthSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: birthDate || null }),
    });
    setSavingBirth(false);
    if (res.ok) {
      setBirthSaved(true);
      setTimeout(() => setBirthSaved(false), 2000);
    }
  }

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

      <div className="flex flex-wrap items-end gap-2">
        <Field label={t.birthDateLabel} htmlFor="perfil-cumple">
          <Input
            id="perfil-cumple"
            type="date"
            className="max-w-44"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          size="sm"
          disabled={savingBirth}
          onClick={saveBirthDate}
        >
          {birthSaved ? (
            <Check className="h-3.5 w-3.5 text-success-strong" aria-hidden />
          ) : null}
          {birthSaved ? t.birthDateSaved : t.birthDateSave}
        </Button>
        <p className="w-full text-xs text-ink-muted">{t.birthDateHint}</p>
      </div>

      <div className="border-t border-border pt-4">
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
