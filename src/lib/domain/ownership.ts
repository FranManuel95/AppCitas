import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";

/**
 * Guardas de pertenencia (aislamiento multi-tenant). Complementan a los
 * guards de sesión: estos verifican que los IDS que llegan en el cuerpo de una
 * petición pertenecen al negocio del administrador autenticado, de modo que un
 * admin no pueda vincular/consumir recursos de otro negocio adivinando su id.
 */

/**
 * Verifica que todos los `serviceIds` pertenecen a `businessId`.
 * Lista vacía u omitida = sin servicios que validar (correcto).
 */
export async function assertServicesOwned(
  businessId: string,
  serviceIds: string[] | undefined,
): Promise<void> {
  if (!serviceIds || serviceIds.length === 0) return;

  const unique = [...new Set(serviceIds)];
  const found = await prisma.service.findMany({
    where: { id: { in: unique }, businessId },
    select: { id: true },
  });

  if (found.length !== unique.length) {
    throw new DomainError(
      "Algún servicio no pertenece a este negocio",
      "SERVICE_NOT_OWNED",
      404,
    );
  }
}
