"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Field, Input } from "@/components/ui/field";

export interface ForgotPasswordLabels {
  emailLabel: string;
  button: string;
  busy: string;
  sent: string;
  errorFallback: string;
}

export function ForgotPasswordForm({ labels }: { labels: ForgotPasswordLabels }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? labels.errorFallback);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3.5 py-3 text-sm text-success-strong">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{labels.sent}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={labels.emailLabel} htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? labels.busy : labels.button}
      </button>
    </form>
  );
}
