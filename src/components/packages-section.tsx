"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/money";

interface PackageOffer {
  id: string;
  name: string;
  serviceName: string;
  sessions: number;
  priceCents: number;
  fullPriceCents: number;
  validityDays: number | null;
}

// Bonos a la venta en la página pública del negocio.
export function PackagesSection({
  packages,
  currency,
  isLoggedIn,
  slug,
}: {
  packages: PackageOffer[];
  currency: string;
  isLoggedIn: boolean;
  slug: string;
}) {
  const router = useRouter();
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function buy(pkg: PackageOffer) {
    setBuying(pkg.id);
    setMessage(null);
    const res = await fetch("/api/packages/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: pkg.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBuying(null);
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo comprar" });
      return;
    }
    const paid =
      json.purchase.paymentStatus === "CHARGED" ||
      json.purchase.paymentStatus === "SIMULATED";
    setMessage({
      kind: "ok",
      text: paid
        ? `¡Bono comprado y pagado! Tienes ${json.purchase.remainingSessions} sesiones para usar al reservar.`
        : `¡Bono reservado! Tienes ${json.purchase.remainingSessions} sesiones; el pago se gestiona en el negocio.`,
    });
    router.refresh();
  }

  if (packages.length === 0) return null;

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900">Bonos</h2>
      <p className="text-xs text-slate-500">
        Paquetes de sesiones a precio reducido.
      </p>
      <ul className="mt-3 space-y-3">
        {packages.map((p) => {
          const saving = p.fullPriceCents - p.priceCents;
          return (
            <li key={p.id} className="rounded-lg border border-slate-100 p-3">
              <p className="font-medium text-slate-800">{p.name}</p>
              <p className="text-sm text-slate-500">
                {p.sessions} × {p.serviceName}
                {p.validityDays ? ` · válido ${p.validityDays} días` : ""}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-slate-900">
                  {formatCents(p.priceCents, currency)}
                </span>{" "}
                {saving > 0 && (
                  <span className="text-emerald-600">
                    (ahorras {formatCents(saving, currency)})
                  </span>
                )}
              </p>
              {isLoggedIn ? (
                <button
                  className="btn-secondary mt-2 w-full"
                  disabled={buying === p.id}
                  onClick={() => buy(p)}
                >
                  {buying === p.id ? "Comprando…" : "Comprar bono"}
                </button>
              ) : (
                <Link
                  href={`/login?next=/b/${slug}`}
                  className="btn-secondary mt-2 w-full"
                >
                  Inicia sesión para comprar
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {message && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
