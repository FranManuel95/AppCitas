import { describe, expect, it } from "vitest";
import { computePlatformEconomics } from "../platform";
import type { PlatformSettings } from "../platform-settings";

const SETTINGS: PlatformSettings = {
  fixedMonthlyCostCents: 4300, // 43 €
  whatsappMsgCostCents: 5,
  smsMsgCostCents: 8,
  stripeFeeBps: 140, // 1,40 %
  stripeFeeFixedCents: 25,
};

// La economía de la plataforma es aritmética pura sobre datos que el sistema
// ya conoce: aquí se blinda el cálculo (fees, margen, punto de equilibrio).
describe("computePlatformEconomics", () => {
  it("calcula costes, beneficio y margen con 10 negocios Pro", () => {
    const eco = computePlatformEconomics({
      mrrCents: 10 * 2900,
      proActive: 10,
      whatsappSent: 400,
      smsSent: 50,
      settings: SETTINGS,
    });
    // fee por cobro: round(2900 × 140/10000)=41 + 25 = 66 → ×10 = 660
    expect(eco.stripeCostCents).toBe(660);
    expect(eco.messagingCostCents).toBe(400 * 5 + 50 * 8); // 2400
    expect(eco.totalCostCents).toBe(660 + 2400 + 4300); // 7360
    expect(eco.profitCents).toBe(29000 - 7360); // 21640
    expect(eco.marginPercent).toBe(75); // round(21640/29000×100)
  });

  it("punto de equilibrio: ceil(fijos / neto por suscripción)", () => {
    const eco = computePlatformEconomics({
      mrrCents: 0,
      proActive: 0,
      whatsappSent: 0,
      smsSent: 0,
      settings: SETTINGS,
    });
    // neto por sub = 2900 − 66 = 2834 → ceil(4300/2834) = 2
    expect(eco.breakEvenBusinesses).toBe(2);
    expect(eco.marginPercent).toBeNull(); // sin ingresos no hay margen
  });

  it("sin costes fijos el punto de equilibrio es 0", () => {
    const eco = computePlatformEconomics({
      mrrCents: 0,
      proActive: 0,
      whatsappSent: 0,
      smsSent: 0,
      settings: { ...SETTINGS, fixedMonthlyCostCents: 0 },
    });
    expect(eco.breakEvenBusinesses).toBe(0);
  });

  it("comisión absurda que come toda la cuota → breakeven imposible (null)", () => {
    const eco = computePlatformEconomics({
      mrrCents: 2900,
      proActive: 1,
      whatsappSent: 0,
      smsSent: 0,
      settings: { ...SETTINGS, stripeFeeBps: 2000, stripeFeeFixedCents: 5000 },
    });
    expect(eco.breakEvenBusinesses).toBeNull();
  });
});
