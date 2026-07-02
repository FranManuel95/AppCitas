"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
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
    <Elements stripe={stripePromise} options={{ clientSecret, locale: "es" }}>
      <StripeSetupForm onSaved={onSaved} />
    </Elements>
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
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }
  if (!config) {
    return <p className="text-sm text-slate-500">Preparando pago seguro…</p>;
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
    <div className="rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-sm text-slate-600">
        Pasarela en modo demostración (Stripe sin configurar): la tarjeta se
        guarda de forma simulada.
      </p>
      <button
        className="btn-secondary mt-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // El setup-intent ya creó el cliente simulado; basta confirmar
          onSaved();
        }}
      >
        {busy ? "…" : "Guardar tarjeta (demo)"}
      </button>
    </div>
  );
}
