import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "./errors";

// Autoservicio RGPD del cliente: derecho de acceso/portabilidad (exportar) y
// derecho de supresión (borrar). El borrado ANONIMIZA la cuenta en vez de
// eliminar la fila: las citas se conservan porque son documentación contable
// del negocio (base legal: obligación legal / interés legítimo del negocio),
// pero se disocian de la identidad del cliente.

export interface UserDataExport {
  exportedAt: string;
  account: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    birthDate: string | null;
    role: string;
    createdAt: string;
    emailVerified: boolean;
  };
  appointments: Array<{
    business: string;
    service: string;
    staff: string | null;
    startAt: string;
    endAt: string;
    status: string;
    priceCents: number;
    chargedCents: number;
    currency: string;
    notes: string | null;
  }>;
  reviews: Array<{
    business: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }>;
  packages: Array<{
    business: string;
    package: string;
    remainingSessions: number;
    expiresAt: string | null;
  }>;
}

/** Reúne todos los datos personales del usuario en un JSON portable (RGPD art. 20). */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      birthDate: true,
      role: true,
      createdAt: true,
      emailVerifiedAt: true,
    },
  });
  if (!user) throw new DomainError("Usuario no encontrado", "USER_NOT_FOUND", 404);

  const [appointments, reviews, packages] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: userId },
      orderBy: { startAt: "desc" },
      select: {
        startAt: true,
        endAt: true,
        status: true,
        priceCents: true,
        chargedCents: true,
        notes: true,
        business: { select: { name: true, currency: true } },
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
    }),
    prisma.review.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        rating: true,
        comment: true,
        createdAt: true,
        business: { select: { name: true } },
      },
    }),
    prisma.clientPackage.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        remainingSessions: true,
        expiresAt: true,
        business: { select: { name: true } },
        package: { select: { name: true } },
      },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      emailVerified: user.emailVerifiedAt !== null,
    },
    appointments: appointments.map((a) => ({
      business: a.business.name,
      service: a.service.name,
      staff: a.staff?.name ?? null,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      priceCents: a.priceCents,
      chargedCents: a.chargedCents,
      currency: a.business.currency,
      notes: a.notes,
    })),
    reviews: reviews.map((r) => ({
      business: r.business.name,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    })),
    packages: packages.map((p) => ({
      business: p.business.name,
      package: p.package.name,
      remainingSessions: p.remainingSessions,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Anonimiza la cuenta del cliente (RGPD art. 17). Disocia los datos personales
 * (nombre, email, teléfono, contraseña, referencias de pago) manteniendo las
 * citas para la contabilidad del negocio. Sube sessionVersion para invalidar
 * todas las sesiones activas y borra los tokens de autenticación pendientes.
 *
 * Solo para cuentas CLIENT: un OWNER/STAFF gestiona un negocio y su borrado
 * dejaría recursos huérfanos; esos casos se atienden por soporte.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new DomainError("Usuario no encontrado", "USER_NOT_FOUND", 404);
  if (user.role !== "CLIENT") {
    throw new DomainError(
      "Las cuentas de negocio no pueden eliminarse desde aquí; contacta con soporte",
      "ACCOUNT_NOT_DELETABLE",
      403,
    );
  }

  // Contraseña irreversible e inservible: hash de un valor aleatorio que nadie
  // conoce (nunca coincidirá con un login).
  const deadHash = await hashPassword(randomUUID());
  const anonEmail = `deleted-${userId}@deleted.local`;

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: "Usuario eliminado",
        email: anonEmail,
        phone: null,
        birthDate: null,
        passwordHash: deadHash,
        emailVerifiedAt: null,
        stripeCustomerId: null,
        sessionVersion: { increment: 1 },
      },
    }),
  ]);
}

/**
 * RGPD desde el mostrador: un cliente SIN cuenta (sombra de invitado o
 * walk-in) pide al negocio borrar sus datos. Las cuentas reales se borran
 * solas desde "Mis datos"; aquí solo se anonimizan sombras, y solo si toda su
 * actividad pertenece a este negocio (una sombra con citas en otro negocio no
 * es "tuya" para borrar).
 */
export async function anonymizeGuestClient(params: {
  businessId: string;
  clientId: string;
}): Promise<void> {
  const { businessId, clientId } = params;
  const user = await prisma.user.findUnique({
    where: { id: clientId },
    select: { id: true, guest: true },
  });
  if (!user) {
    throw new DomainError("Cliente no encontrado", "CLIENT_NOT_FOUND", 404);
  }
  if (!user.guest) {
    throw new DomainError(
      "Solo se pueden anonimizar clientes sin cuenta; los registrados borran sus datos desde su perfil",
      "CLIENT_NOT_GUEST",
      409,
    );
  }

  const [ownCount, foreignCount] = await Promise.all([
    prisma.appointment.count({ where: { clientId, businessId } }),
    prisma.appointment.count({
      where: { clientId, businessId: { not: businessId } },
    }),
  ]);
  if (ownCount === 0) {
    throw new DomainError("Cliente no encontrado", "CLIENT_NOT_FOUND", 404);
  }
  if (foreignCount > 0) {
    throw new DomainError(
      "Este cliente también tiene citas en otros negocios: no se puede anonimizar desde aquí",
      "CLIENT_SHARED",
      409,
    );
  }

  // Se conservan las citas (histórico contable) pero dejan de ser atribuibles
  // a una persona; notas del equipo, lista de espera, suscripciones push y
  // avisos pendientes se retiran.
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId: clientId } }),
    prisma.clientNote.deleteMany({ where: { clientId } }),
    prisma.pushSubscription.deleteMany({ where: { userId: clientId } }),
    prisma.waitlistEntry.deleteMany({ where: { clientId } }),
    prisma.notification.updateMany({
      where: { appointment: { clientId }, status: "PENDING" },
      data: { status: "SKIPPED", lastError: "Cliente anonimizado (RGPD)" },
    }),
    prisma.user.update({
      where: { id: clientId },
      data: {
        name: "Cliente eliminado",
        email: `borrado-${randomUUID().slice(0, 12)}@deleted.local`,
        phone: null,
        birthDate: null,
        consentedAt: null,
      },
    }),
  ]);
}
