import { redirect } from "next/navigation";
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
