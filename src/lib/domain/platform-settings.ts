import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";

// Ajustes económicos de la plataforma: fila única editable desde el panel de
// super-admin. La primera lectura crea la fila con los valores por defecto
// (sin seed manual); el upsert por id fijo es idempotente ante concurrencia.

const SETTINGS_ID = "platform";

export interface PlatformSettings {
  fixedMonthlyCostCents: number;
  whatsappMsgCostCents: number;
  smsMsgCostCents: number;
  stripeFeeBps: number;
  stripeFeeFixedCents: number;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
  return {
    fixedMonthlyCostCents: row.fixedMonthlyCostCents,
    whatsappMsgCostCents: row.whatsappMsgCostCents,
    smsMsgCostCents: row.smsMsgCostCents,
    stripeFeeBps: row.stripeFeeBps,
    stripeFeeFixedCents: row.stripeFeeFixedCents,
  };
}

export async function updatePlatformSettings(
  data: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new DomainError(`Valor no válido para ${key}`, "INVALID_SETTING");
    }
  }
  if (data.stripeFeeBps !== undefined && data.stripeFeeBps > 2000) {
    // >20 % de comisión es con seguridad un error de tecleo
    throw new DomainError("Comisión fuera de rango", "INVALID_SETTING");
  }

  const row = await prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  return {
    fixedMonthlyCostCents: row.fixedMonthlyCostCents,
    whatsappMsgCostCents: row.whatsappMsgCostCents,
    smsMsgCostCents: row.smsMsgCostCents,
    stripeFeeBps: row.stripeFeeBps,
    stripeFeeFixedCents: row.stripeFeeFixedCents,
  };
}
