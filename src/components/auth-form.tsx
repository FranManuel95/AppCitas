"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

// Formulario compartido por login/registro: envía JSON al endpoint indicado
// y redirige según el rol devuelto (los dueños van directos a su panel).
export function AuthForm({
  endpoint,
  fields,
  submitLabel,
  adminRedirect = false,
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
  adminRedirect?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [...formData.entries()].filter(([, v]) => String(v).trim() !== ""),
    );

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Algo ha ido mal, inténtalo de nuevo");
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
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.required ?? true}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            className="input"
          />
        </div>
      ))}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Un momento…" : submitLabel}
      </button>
    </form>
  );
}
