"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Guardado de tarjeta para poder cobrar automáticamente cancelaciones tardías.
// Con Stripe configurado usa Payment Element (SetupIntent off-session); sin
// claves usa el proveedor simulado para poder probar el flujo completo.

function StripeSetupForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message ?? "No se pudo guardar la tarjeta");
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PaymentElement />
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      <button type="submit" disabled={busy || !stripe} className="btn-primary">
        {busy ? "Guardando…" : "Guardar tarjeta"}
      </button>
    </form>
  );
}

function StripeCardSetup({
  clientSecret,
  publishableKey,
  onSaved,
}: {
  clientSecret: string;
  publishableKey: string;
  onSaved: () => void;
}) {
  const stripePromise = useMemo(
    () => loadStripe(publishableKey),
    [publishableKey],
  );
  return (
    <Card className="p-4">
      <Elements stripe={stripePromise} options={{ clientSecret, locale: "es" }}>
        <StripeSetupForm onSaved={onSaved} />
      </Elements>
    </Card>
  );
}

export function CardSetup({ onSaved }: { onSaved: () => void }) {
  const [config, setConfig] = useState<{
    provider: string;
    clientSecret: string;
    publishableKey: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/payments/setup-intent", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "No se pudo iniciar el guardado de tarjeta");
        return;
      }
      setConfig(json);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-strong">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{error}</p>
      </div>
    );
  }
  if (!config) {
    return (
      <Card className="p-4">
        <p className="text-sm text-ink-muted">Preparando pago seguro…</p>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      </Card>
    );
  }

  if (config.provider === "stripe" && config.publishableKey) {
    return (
      <StripeCardSetup
        clientSecret={config.clientSecret}
        publishableKey={config.publishableKey}
        onSaved={onSaved}
      />
    );
  }

  // Proveedor simulado (desarrollo): el "guardado" solo marca el cliente
  return (
    <Card className="border-dashed border-border-strong p-4">
      <p className="text-sm text-ink-soft">
        Pasarela en modo demostración (Stripe sin configurar): la tarjeta se
        guarda de forma simulada.
      </p>
      <button
        className="btn-secondary mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // El setup-intent ya creó el cliente simulado; basta confirmar
          onSaved();
        }}
      >
        {busy ? "…" : "Guardar tarjeta (demo)"}
      </button>
    </Card>
  );
}
