"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Field, Input } from "@/components/ui/field";

// Formulario compartido por login/registro: envía JSON al endpoint indicado
// y redirige según el rol devuelto (los dueños van directos a su panel).
export function AuthForm({
  endpoint,
  fields,
  submitLabel,
  busyLabel = "Un momento…",
  errorFallback = "Algo ha ido mal, inténtalo de nuevo",
  adminRedirect = false,
  consent,
  totpLabel,
}: {
  endpoint: string;
  fields: Array<{
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    autoComplete?: string;
    placeholder?: string;
  }>;
  submitLabel: string;
  busyLabel?: string;
  errorFallback?: string;
  adminRedirect?: boolean;
  // Aceptación de privacidad/términos (obligatoria en los registros)
  consent?: React.ReactNode;
  // Etiqueta del código 2FA (solo login): el campo aparece cuando el servidor
  // responde TOTP_REQUIRED para esa cuenta.
  totpLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askTotp, setAskTotp] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [...formData.entries()].filter(
        ([k, v]) => k !== "consent" && String(v).trim() !== "",
      ),
    );

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Cuenta con 2FA: mostrar el campo del código y reintentar con él
      if (json.code === "TOTP_REQUIRED") setAskTotp(true);
      setError(json.error ?? errorFallback);
      setBusy(false);
      return;
    }

    const next = searchParams.get("next");
    const isAdmin =
      adminRedirect || json.user?.role === "OWNER" || !!json.business;
    const isStaff = json.user?.role === "STAFF";
    router.push(next ?? (isAdmin ? "/admin" : isStaff ? "/personal" : "/"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {fields.map((f) => (
        <Field key={f.name} label={f.label} htmlFor={f.name}>
          <Input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.required ?? true}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
          />
        </Field>
      ))}
      {askTotp && (
        <Field label={totpLabel ?? "Código 2FA"} htmlFor="totpCode">
          {/* Acepta el TOTP de 6 dígitos o un código de recuperación XXXX-XXXX */}
          <Input
            id="totpCode"
            name="totpCode"
            maxLength={9}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </Field>
      )}
      {consent && (
        <label className="flex items-start gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-brand-600"
          />
          <span>{consent}</span>
        </label>
      )}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
