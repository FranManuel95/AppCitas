"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { formatCents } from "@/lib/money";
import { fmt, type Dict } from "@/lib/i18n/shared";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface MembershipPlanOffer {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  discountPercent: number;
  maxAppointmentsPerMonth: number | null;
}

// Membresías a la venta en la página pública del negocio (patrón
// PackagesSection). El alta cobra la cuota mensual con la tarjeta guardada.
export function MembershipSection({
  plans,
  currency,
  isLoggedIn,
  slug,
  t,
}: {
  plans: MembershipPlanOffer[];
  currency: string;
  isLoggedIn: boolean;
  slug: string;
  t: Dict["business"];
}) {
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function join(plan: MembershipPlanOffer) {
    setJoining(plan.id);
    setMessage(null);
    const res = await fetch("/api/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id }),
    });
    const json = await res.json().catch(() => ({}));
    setJoining(null);
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? t.purchaseError });
      return;
    }
    setMessage({ kind: "ok", text: t.membershipJoined });
    router.refresh();
  }

  if (plans.length === 0) return null;

  return (
    <Card>
      <h2 className="font-semibold tracking-tight text-ink">
        {t.membershipsTitle}
      </h2>
      <p className="mt-0.5 text-xs text-ink-muted">{t.membershipsSubtitle}</p>
      <ul className="mt-3 space-y-3">
        {plans.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-border bg-surface-2 p-3.5"
          >
            <p className="font-medium text-ink">{p.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {p.maxAppointmentsPerMonth
                  ? fmt(t.membershipBenefitCapped, {
                      percent: p.discountPercent,
                      cap: p.maxAppointmentsPerMonth,
                    })
                  : fmt(t.membershipBenefit, { percent: p.discountPercent })}
              </span>
            </p>
            {p.description && (
              <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
            )}
            <p className="mt-2 text-lg font-semibold tracking-tight text-ink">
              {fmt(t.membershipPerMonth, {
                price: formatCents(p.priceCents, currency),
              })}
            </p>
            {isLoggedIn ? (
              <button
                className={buttonClasses({
                  variant: "secondary",
                  className: "mt-3 w-full",
                })}
                disabled={joining === p.id}
                onClick={() => join(p)}
              >
                {joining === p.id ? t.membershipJoining : t.membershipJoin}
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
        ))}
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
