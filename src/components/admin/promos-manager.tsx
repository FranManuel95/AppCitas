"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  CircleAlert,
  Hash,
  Layers,
  Ticket,
  TicketPercent,
} from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/shared";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";

interface PackageDTO {
  id: string;
  name: string;
  serviceId: string;
  serviceName: string;
  servicePriceCents: number;
  sessions: number;
  priceCents: number;
  validityDays: number | null;
  active: boolean;
  purchases: number;
}

interface CouponDTO {
  id: string;
  code: string;
  type: string;
  value: number;
  active: boolean;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
  priceCents: number;
}

// Textos resueltos en el servidor: el subárbol admin.promos completo más las
// acciones comunes que usa este componente.
type PromosLabels = Dict["admin"]["promos"] &
  Pick<
    Dict["admin"]["common"],
    "cancel" | "activate" | "deactivate" | "active" | "inactive"
  >;

export function PromosManager({
  packages,
  coupons,
  services,
  currency,
  dateLocale,
  labels,
}: {
  packages: PackageDTO[];
  coupons: CouponDTO[];
  services: ServiceOption[];
  currency: string;
  dateLocale: string;
  labels: PromosLabels;
}) {
  const router = useRouter();
  const [creatingPackage, setCreatingPackage] = useState(false);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const validity = Number(form.get("validityDays"));
    const res = await fetch("/api/admin/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        serviceId: String(form.get("serviceId") ?? ""),
        sessions: Number(form.get("sessions")),
        priceCents: Math.round(Number(form.get("price")) * 100),
        validityDays: validity > 0 ? validity : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.createPackageError);
      return;
    }
    setCreatingPackage(false);
    router.refresh();
  }

  async function submitCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type"));
    const rawValue = Number(form.get("value"));
    const maxRedemptions = Number(form.get("maxRedemptions"));
    const expires = String(form.get("expiresAt") ?? "");
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(form.get("code") ?? ""),
        type,
        value: type === "FIXED" ? Math.round(rawValue * 100) : rawValue,
        maxRedemptions: maxRedemptions > 0 ? maxRedemptions : null,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.createCouponError);
      return;
    }
    setCreatingCoupon(false);
    router.refresh();
  }

  async function togglePackage(pkg: PackageDTO) {
    await fetch(`/api/admin/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !pkg.active }),
    });
    router.refresh();
  }

  async function toggleCoupon(coupon: CouponDTO) {
    await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !coupon.active }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {/* Bonos */}
      <section className="space-y-4">
        <SectionHeader
          title={labels.packagesTitle}
          description={labels.packagesDescription}
          action={
            !creatingPackage ? (
              <Button onClick={() => setCreatingPackage(true)}>
                {labels.newPackage}
              </Button>
            ) : undefined
          }
        />

        {creatingPackage && (
          <Card>
            <form onSubmit={submitPackage} className="grid gap-4 sm:grid-cols-2">
              <Field
                label={labels.packageName}
                htmlFor="pkg-name"
                className="sm:col-span-2"
              >
                <Input id="pkg-name" name="name" required minLength={2} />
              </Field>
              <Field label={labels.packageService} htmlFor="pkg-service">
                <Select id="pkg-service" name="serviceId" required>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatCents(s.priceCents, currency)})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={labels.packageSessions} htmlFor="pkg-sessions">
                <Input
                  id="pkg-sessions"
                  name="sessions"
                  type="number"
                  min={2}
                  max={100}
                  required
                  defaultValue={5}
                />
              </Field>
              <Field label={labels.packagePrice} htmlFor="pkg-price">
                <Input
                  id="pkg-price"
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </Field>
              <Field label={labels.packageValidity} htmlFor="pkg-validity">
                <Input id="pkg-validity" name="validityDays" type="number" min={0} />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit">{labels.createPackage}</Button>
                <Button
                  variant="secondary"
                  onClick={() => setCreatingPackage(false)}
                >
                  {labels.cancel}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-3">
          {packages.map((p) => (
            <Card
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Ticket className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{p.name}</p>
                    {p.active ? (
                      <Badge tone="success">{labels.active}</Badge>
                    ) : (
                      <Badge tone="neutral">{labels.inactive}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers
                        className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      {fmt(labels.sessionsTimesService, {
                        sessions: p.sessions,
                        service: p.serviceName,
                      })}
                    </span>
                    <span className="font-semibold tabular-nums text-ink">
                      {formatCents(p.priceCents, currency)}
                    </span>
                    <span className="tabular-nums text-ink-muted">
                      {fmt(labels.standalonePrice, {
                        amount: formatCents(
                          p.sessions * p.servicePriceCents,
                          currency,
                        ),
                      })}
                    </span>
                    {p.validityDays ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays
                          className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                          aria-hidden
                        />
                        {fmt(labels.validDays, { days: p.validityDays })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-ink-muted">
                    {fmt(labels.packagesSold, { count: p.purchases })}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => togglePackage(p)}
              >
                {p.active ? labels.deactivate : labels.activate}
              </Button>
            </Card>
          ))}
          {packages.length === 0 && (
            <EmptyState
              icon={Ticket}
              title={labels.packagesEmptyTitle}
              description={labels.packagesEmptyDescription}
            />
          )}
        </div>
      </section>

      {/* Cupones */}
      <section className="space-y-4">
        <SectionHeader
          title={labels.couponsTitle}
          description={labels.couponsDescription}
          action={
            !creatingCoupon ? (
              <Button onClick={() => setCreatingCoupon(true)}>
                {labels.newCoupon}
              </Button>
            ) : undefined
          }
        />

        {creatingCoupon && (
          <Card>
            <form onSubmit={submitCoupon} className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.couponCode} htmlFor="coupon-code">
                <Input
                  id="coupon-code"
                  name="code"
                  required
                  minLength={3}
                  maxLength={30}
                  placeholder={labels.couponCodePlaceholder}
                  className="uppercase"
                />
              </Field>
              <Field label={labels.couponType} htmlFor="coupon-type">
                <Select id="coupon-type" name="type">
                  <option value="PERCENT">{labels.couponTypePercent}</option>
                  <option value="FIXED">{labels.couponTypeFixed}</option>
                </Select>
              </Field>
              <Field label={labels.couponValue} htmlFor="coupon-value">
                <Input
                  id="coupon-value"
                  name="value"
                  type="number"
                  min={1}
                  step="0.01"
                  required
                />
              </Field>
              <Field label={labels.couponMaxUses} htmlFor="coupon-max">
                <Input id="coupon-max" name="maxRedemptions" type="number" min={0} />
              </Field>
              <Field label={labels.couponExpiry} htmlFor="coupon-expires">
                <Input id="coupon-expires" name="expiresAt" type="date" />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">{labels.createCoupon}</Button>
                <Button
                  variant="secondary"
                  onClick={() => setCreatingCoupon(false)}
                >
                  {labels.cancel}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-3">
          {coupons.map((c) => (
            <Card
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-sm font-medium text-ink">
                    {c.code}
                  </code>
                  <Badge tone="brand" icon={TicketPercent}>
                    {c.type === "PERCENT"
                      ? fmt(labels.percentOff, { value: c.value })
                      : fmt(labels.amountOff, {
                          amount: formatCents(c.value, currency),
                        })}
                  </Badge>
                  {!c.active && <Badge tone="neutral">{labels.inactive}</Badge>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {fmt(labels.usedCount, { count: c.timesRedeemed })}
                    {c.maxRedemptions
                      ? fmt(labels.usedOfMax, { max: c.maxRedemptions })
                      : ""}
                  </span>
                  {c.expiresAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {fmt(labels.expiresOn, {
                        date: new Date(c.expiresAt).toLocaleDateString(
                          dateLocale,
                        ),
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleCoupon(c)}
              >
                {c.active ? labels.deactivate : labels.activate}
              </Button>
            </Card>
          ))}
          {coupons.length === 0 && (
            <EmptyState icon={TicketPercent} title={labels.couponsEmptyTitle} />
          )}
        </div>
      </section>
    </div>
  );
}
