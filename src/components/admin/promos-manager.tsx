"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatCents } from "@/lib/money";

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

export function PromosManager({
  packages,
  coupons,
  services,
  currency,
}: {
  packages: PackageDTO[];
  coupons: CouponDTO[];
  services: ServiceOption[];
  currency: string;
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
      setError(json.error ?? "No se pudo crear el bono");
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
      setError(json.error ?? "No se pudo crear el cupón");
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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Bonos */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Bonos de sesiones
            </h2>
            <p className="text-sm text-slate-500">
              Packs prepagados de un servicio a precio cerrado.
            </p>
          </div>
          {!creatingPackage && (
            <button
              className="btn-primary"
              onClick={() => setCreatingPackage(true)}
            >
              + Nuevo bono
            </button>
          )}
        </div>

        {creatingPackage && (
          <form onSubmit={submitPackage} className="card mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nombre</label>
              <input name="name" required minLength={2} className="input" />
            </div>
            <div>
              <label className="label">Servicio</label>
              <select name="serviceId" required className="input">
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCents(s.priceCents, currency)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nº de sesiones</label>
              <input
                name="sessions"
                type="number"
                min={2}
                max={100}
                required
                defaultValue={5}
                className="input"
              />
            </div>
            <div>
              <label className="label">Precio del bono (€)</label>
              <input
                name="price"
                type="number"
                min={0}
                step="0.01"
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Validez (días; vacío = sin caducidad)</label>
              <input name="validityDays" type="number" min={0} className="input" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary">
                Crear bono
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCreatingPackage(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {packages.map((p) => (
            <div
              key={p.id}
              className="card flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {p.name}
                  {!p.active && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {p.sessions} × {p.serviceName} ·{" "}
                  {formatCents(p.priceCents, currency)}{" "}
                  <span className="text-slate-400">
                    (suelto: {formatCents(p.sessions * p.servicePriceCents, currency)})
                  </span>
                  {p.validityDays ? ` · válido ${p.validityDays} días` : ""}
                </p>
                <p className="text-xs text-slate-400">
                  {p.purchases} bonos vendidos
                </p>
              </div>
              <button className="btn-secondary" onClick={() => togglePackage(p)}>
                {p.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
          {packages.length === 0 && (
            <p className="card text-sm text-slate-500">
              Sin bonos. Crea el primero para fidelizar a tus clientes.
            </p>
          )}
        </div>
      </section>

      {/* Cupones */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cupones</h2>
            <p className="text-sm text-slate-500">
              Códigos de descuento que el cliente introduce al reservar.
            </p>
          </div>
          {!creatingCoupon && (
            <button className="btn-primary" onClick={() => setCreatingCoupon(true)}>
              + Nuevo cupón
            </button>
          )}
        </div>

        {creatingCoupon && (
          <form onSubmit={submitCoupon} className="card mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Código</label>
              <input
                name="code"
                required
                minLength={3}
                maxLength={30}
                placeholder="BIENVENIDA10"
                className="input uppercase"
              />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select name="type" className="input">
                <option value="PERCENT">Porcentaje (%)</option>
                <option value="FIXED">Importe fijo (€)</option>
              </select>
            </div>
            <div>
              <label className="label">Valor (% o €)</label>
              <input
                name="value"
                type="number"
                min={1}
                step="0.01"
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Usos máximos (vacío = ilimitado)</label>
              <input name="maxRedemptions" type="number" min={0} className="input" />
            </div>
            <div>
              <label className="label">Caducidad (opcional)</label>
              <input name="expiresAt" type="date" className="input" />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn-primary">
                Crear cupón
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCreatingCoupon(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {coupons.map((c) => (
            <div
              key={c.id}
              className="card flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-mono font-medium text-slate-900">
                  {c.code}
                  {!c.active && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-xs text-slate-500">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {c.type === "PERCENT"
                    ? `${c.value}% de descuento`
                    : `${formatCents(c.value, currency)} de descuento`}
                  {" · "}
                  {c.timesRedeemed} usos
                  {c.maxRedemptions ? ` de ${c.maxRedemptions}` : ""}
                  {c.expiresAt
                    ? ` · caduca ${new Date(c.expiresAt).toLocaleDateString("es-ES")}`
                    : ""}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => toggleCoupon(c)}>
                {c.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
          {coupons.length === 0 && (
            <p className="card text-sm text-slate-500">Sin cupones creados.</p>
          )}
        </div>
      </section>
    </div>
  );
}
