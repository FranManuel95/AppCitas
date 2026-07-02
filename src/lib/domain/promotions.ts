// Lógica pura de promociones: descuento de cupones y validez de bonos.

export interface CouponRules {
  type: string; // PERCENT | FIXED
  value: number;
  active: boolean;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
}

// Motivo de rechazo del cupón, o null si es utilizable.
export function couponRejection(
  coupon: CouponRules | null,
  now: Date,
): string | null {
  if (!coupon || !coupon.active) return "El cupón no existe o no está activo";
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
    return "El cupón ha caducado";
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.timesRedeemed >= coupon.maxRedemptions
  ) {
    return "El cupón ha agotado sus usos";
  }
  return null;
}

export function couponDiscountCents(
  coupon: Pick<CouponRules, "type" | "value">,
  priceCents: number,
): number {
  const discount =
    coupon.type === "PERCENT"
      ? Math.round((priceCents * coupon.value) / 100)
      : coupon.value;
  return Math.min(Math.max(0, discount), priceCents);
}

export interface ClientPackageState {
  remainingSessions: number;
  expiresAt: Date | null;
  packageServiceId: string;
}

// Motivo de rechazo del bono para un servicio, o null si es canjeable.
export function packageRejection(
  pkg: ClientPackageState | null,
  serviceId: string,
  now: Date,
): string | null {
  if (!pkg) return "El bono no existe";
  if (pkg.packageServiceId !== serviceId) {
    return "El bono no cubre este servicio";
  }
  if (pkg.remainingSessions <= 0) return "El bono no tiene sesiones restantes";
  if (pkg.expiresAt && pkg.expiresAt.getTime() < now.getTime()) {
    return "El bono ha caducado";
  }
  return null;
}
