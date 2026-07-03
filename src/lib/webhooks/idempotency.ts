import { prisma } from "@/lib/prisma";

/**
 * Reclama un evento de webhook por su id para procesarlo una sola vez.
 *
 * Stripe garantiza el envío "al menos una vez": reintenta ante fallos de red o
 * respuestas lentas y puede reordenar eventos. Sin deduplicación, un mismo
 * evento (un cobro, un cambio de suscripción) se aplicaría varias veces.
 *
 * Se inserta el id en `ProcessedWebhookEvent` ANTES de procesar: la clave
 * primaria hace la inserción atómica, así que solo el primer intento gana. Si
 * el evento ya existe (violación de unicidad P2002), devuelve `false` y el
 * llamante responde 200 sin re-aplicar nada.
 */
export async function claimWebhookEvent(
  eventId: string,
  type: string,
): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({ data: { eventId, type } });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}
