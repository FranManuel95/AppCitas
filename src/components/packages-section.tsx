"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ticket } from "lucide-react";
import { formatCents } from "@/lib/money";
import { fmt, type Dict } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

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
  t,
}: {
  packages: PackageOffer[];
  currency: string;
  isLoggedIn: boolean;
  slug: string;
  t: Dict["business"];
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
      setMessage({ kind: "error", text: json.error ?? t.purchaseError });
      return;
    }
    const paid =
      json.purchase.paymentStatus === "CHARGED" ||
      json.purchase.paymentStatus === "SIMULATED";
    setMessage({
      kind: "ok",
      text: paid
        ? fmt(t.packageBoughtPaid, { n: json.purchase.remainingSessions })
        : fmt(t.packageBoughtPending, { n: json.purchase.remainingSessions }),
    });
    router.refresh();
  }

  if (packages.length === 0) return null;

  return (
    <Card>
      <h2 className="font-semibold tracking-tight text-ink">
        {t.packagesTitle}
      </h2>
      <p className="mt-0.5 text-xs text-ink-muted">{t.packagesSubtitle}</p>
      <ul className="mt-3 space-y-3">
        {packages.map((p) => {
          const saving = p.fullPriceCents - p.priceCents;
          return (
            <li
              key={p.id}
              className="rounded-lg border border-border bg-surface-2 p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <p className="font-medium text-ink">{p.name}</p>
                {saving > 0 && (
                  <Badge tone="success">
                    {fmt(t.youSave, { amount: formatCents(saving, currency) })}
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {p.sessions} × {p.serviceName}
                  {p.validityDays
                    ? ` · ${fmt(t.validFor, { days: p.validityDays })}`
                    : ""}
                </span>
              </p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-ink">
                {formatCents(p.priceCents, currency)}
              </p>
              {isLoggedIn ? (
                <button
                  className={buttonClasses({
                    variant: "secondary",
                    className: "mt-3 w-full",
                  })}
                  disabled={buying === p.id}
                  onClick={() => buy(p)}
                >
                  {buying === p.id ? t.buying : t.buyPackage}
                </button>
              ) : (
                <Link
                  href={`/login?next=/b/${slug}`}
                  className={buttonClasses({
                    variant: "secondary",
                    className: "mt-3 w-full",
                  })}
                >
                  {t.loginToBuy}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {message && (
        <p
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-sm",
            message.kind === "ok"
              ? "bg-success-soft text-success-strong"
              : "bg-danger-soft text-danger-strong",
          )}
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}
