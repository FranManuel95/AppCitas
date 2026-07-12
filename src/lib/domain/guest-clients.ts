import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "./errors";

// Clientes "sombra": cuentas sin contraseña utilizable creadas al reservar
// como invitado o cuando el negocio apunta una cita de mostrador/teléfono.
// Se reclaman después demostrando la posesión del email (flujo de reset).

// Dominio centinela para walk-ins sin email (User.email es único y NOT NULL).
// Nunca se envía correo a estas direcciones (el outbox las salta) y las vistas
// las muestran como "—".
export const SENTINEL_EMAIL_DOMAIN = "sin-email.appcitas.local";

export function isSentinelEmail(email: string): boolean {
  return email.endsWith(`@${SENTINEL_EMAIL_DOMAIN}`);
}

export interface FindOrCreateGuestParams {
  name: string;
  email?: string | null;
  phone?: string | null;
  // Camino admin (cita manual): puede reservar sobre una cuenta reclamada
  // (el cliente registrado que llama por teléfono). El camino invitado NO:
  // reservar sin sesión sobre la cuenta de otro sería suplantación.
  allowClaimedAccounts: boolean;
  // Invitado online: aceptó términos/privacidad (RGPD) en el formulario.
  consent?: boolean;
  now?: Date;
}

export async function findOrCreateGuestClient(
  params: FindOrCreateGuestParams,
): Promise<{ clientId: string; created: boolean }> {
  const now = params.now ?? new Date();
  const name = params.name.trim();
  const email = params.email?.trim().toLowerCase() || null;
  const phone = params.phone?.trim() || null;

  if (email) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, guest: true, phone: true },
    });
    if (existing) {
      if (!existing.guest && !params.allowClaimedAccounts) {
        throw new DomainError(
          "Este email ya tiene una cuenta: inicia sesión para reservar",
          "EMAIL_HAS_ACCOUNT",
          409,
        );
      }
      // Completar el teléfono si el que tenemos es más reciente
      if (phone && !existing.phone) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { phone },
        });
      }
      return { clientId: existing.id, created: false };
    }
  } else if (phone) {
    // Walk-in sin email: reutilizar la sombra con ese teléfono si existe
    const byPhone = await prisma.user.findFirst({
      where: { phone, guest: true },
      select: { id: true },
    });
    if (byPhone) return { clientId: byPhone.id, created: false };
  }

  // passwordHash aleatorio: la cuenta no es logeable hasta reclamarla
  const passwordHash = await hashPassword(
    randomBytes(32).toString("base64url"),
  );
  const user = await prisma.user.create({
    data: {
      name,
      email:
        email ??
        // cuid del propio registro no está disponible antes de crear; un
        // sufijo aleatorio corto garantiza unicidad del centinela
        `walkin-${randomBytes(8).toString("hex")}@${SENTINEL_EMAIL_DOMAIN}`,
      phone,
      passwordHash,
      role: "CLIENT",
      guest: true,
      // El consentimiento online (checkbox) se registra; el walk-in dio sus
      // datos al negocio en persona, no online → sin consentedAt.
      consentedAt: params.consent ? now : null,
    },
  });
  return { clientId: user.id, created: true };
}
