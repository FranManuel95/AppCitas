import { prisma } from "@/lib/prisma";

// "Primeros pasos" del negocio: señales REALES de configuración, no proxies
// confusos. La checklist del dashboard se muestra hasta completar los pasos
// obligatorios y opcionales (o hasta que el dueño la oculte).

export type OnboardingStepKey = "services" | "hours" | "payments" | "staff";

export interface OnboardingStep {
  key: OnboardingStepKey;
  href: string;
  done: boolean;
  optional: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completed: number;
  total: number;
}

export interface OnboardingInput {
  // Servicios activos con sus marcas de tiempo: el servicio de ejemplo
  // sembrado en el alta NO cuenta como "personalizado" hasta que se edite.
  services: Array<{ createdAt: Date; updatedAt: Date }>;
  businessHourCount: number;
  // Señal real de cobros: cuenta de Stripe Connect activa (no el proxy
  // requireCardToBook, que es una política y no una configuración).
  stripeChargesEnabled: boolean;
  staffCount: number;
}

// Margen para distinguir el `updatedAt` que fija Prisma al crear del de una
// edición humana posterior.
const EDIT_MARGIN_MS = 2_000;

export function computeOnboardingSteps(
  input: OnboardingInput,
): OnboardingStatus {
  const customizedServices =
    input.services.length > 1 ||
    input.services.some(
      (s) => s.updatedAt.getTime() - s.createdAt.getTime() > EDIT_MARGIN_MS,
    );

  const steps: OnboardingStep[] = [
    {
      key: "services",
      href: "/admin/servicios",
      done: customizedServices,
      optional: false,
    },
    {
      key: "hours",
      href: "/admin/horario",
      done: input.businessHourCount > 0,
      optional: false,
    },
    {
      key: "payments",
      href: "/admin/cobros",
      done: input.stripeChargesEnabled,
      optional: true,
    },
    {
      key: "staff",
      href: "/admin/equipo",
      done: input.staffCount > 0,
      optional: true,
    },
  ];

  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
  };
}

export async function loadOnboardingStatus(
  businessId: string,
): Promise<OnboardingStatus> {
  const [services, businessHourCount, business, staffCount] =
    await Promise.all([
      prisma.service.findMany({
        where: { businessId, active: true },
        select: { createdAt: true, updatedAt: true },
      }),
      prisma.businessHour.count({ where: { businessId } }),
      prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { stripeChargesEnabled: true },
      }),
      prisma.staffMember.count({ where: { businessId, active: true } }),
    ]);

  return computeOnboardingSteps({
    services,
    businessHourCount,
    stripeChargesEnabled: business.stripeChargesEnabled,
    staffCount,
  });
}
