import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { DomainError } from "@/lib/domain/errors";
import { getSessionUser, type SessionUser } from "./session";

// Guards para páginas (redirigen) y para la API (lanzan DomainError → JSON).

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireBusinessAdmin(): Promise<
  SessionUser & { businessId: string }
> {
  const user = await requireUser();
  if (!ADMIN_ROLES.includes(user.role) || !user.businessId) redirect("/");
  return user as SessionUser & { businessId: string };
}

export async function apiRequireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError("Debes iniciar sesión", "UNAUTHENTICATED", 401);
  }
  return user;
}

export async function apiRequireBusinessAdmin(): Promise<
  SessionUser & { businessId: string }
> {
  const user = await apiRequireUser();
  if (!ADMIN_ROLES.includes(user.role) || !user.businessId) {
    throw new DomainError("Acceso restringido al negocio", "FORBIDDEN", 403);
  }
  return user as SessionUser & { businessId: string };
}

export function isBusinessAdmin(
  user: SessionUser | null,
  businessId: string,
): boolean {
  return (
    !!user && ADMIN_ROLES.includes(user.role) && user.businessId === businessId
  );
}

// --- Super-admin de la plataforma (rol SUPER_ADMIN) ------------------------
// Gobierna TODOS los negocios y no está atado a ningún businessId propio, por
// eso no reutiliza los guards de negocio (que exigen businessId).

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/");
  return user;
}

export async function apiRequireSuperAdmin(): Promise<SessionUser> {
  const user = await apiRequireUser();
  if (user.role !== "SUPER_ADMIN") {
    throw new DomainError("Acceso restringido a la plataforma", "FORBIDDEN", 403);
  }
  return user;
}

// --- Portal del empleado (rol STAFF) ---------------------------------------

export interface StaffSession extends SessionUser {
  businessId: string;
  staffId: string;
  staffName: string;
}

async function resolveStaff(user: SessionUser): Promise<StaffSession | null> {
  if (user.role !== "STAFF" || !user.businessId) return null;
  const profile = await prisma.staffMember.findFirst({
    where: { userId: user.id, businessId: user.businessId, active: true },
    select: { id: true, name: true },
  });
  if (!profile) return null;
  return {
    ...user,
    businessId: user.businessId,
    staffId: profile.id,
    staffName: profile.name,
  };
}

export async function requireStaff(): Promise<StaffSession> {
  const user = await requireUser();
  const staff = await resolveStaff(user);
  if (!staff) redirect("/");
  return staff;
}

export async function apiRequireStaff(): Promise<StaffSession> {
  const user = await apiRequireUser();
  const staff = await resolveStaff(user);
  if (!staff) {
    throw new DomainError("Acceso restringido a empleados", "FORBIDDEN", 403);
  }
  return staff;
}
