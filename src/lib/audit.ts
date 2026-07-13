import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

export type AuditEvent =
  | "LOGIN_OK"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "REGISTER"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_OK"
  | "EMAIL_VERIFIED"
  | "SESSIONS_REVOKED"
  | "STAFF_INVITED"
  | "TOTP_ENABLED"
  | "TOTP_DISABLED"
  | "TOTP_RECOVERY_USED"
  | "CLIENT_ANONYMIZED";

// Registro de auditoría de accesos. Nunca interrumpe el flujo principal:
// un fallo al auditar se registra en el log y se sigue adelante.
export async function audit(
  event: AuditEvent,
  opts: {
    userId?: string | null;
    email?: string | null;
    request?: Request;
    detail?: string;
  } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        userId: opts.userId ?? null,
        email: opts.email ?? null,
        ip: opts.request ? clientIp(opts.request) : null,
        userAgent: opts.request
          ? (opts.request.headers.get("user-agent")?.slice(0, 300) ?? null)
          : null,
        detail: opts.detail ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] no se pudo registrar el evento:", error);
  }
}

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  LOGIN_OK: "Inicio de sesión",
  LOGIN_FAILED: "Intento de acceso fallido",
  LOGOUT: "Cierre de sesión",
  REGISTER: "Registro de cuenta",
  PASSWORD_RESET_REQUESTED: "Solicitud de restablecimiento",
  PASSWORD_RESET_OK: "Contraseña restablecida",
  EMAIL_VERIFIED: "Email verificado",
  SESSIONS_REVOKED: "Sesiones revocadas",
  STAFF_INVITED: "Empleado invitado",
  TOTP_ENABLED: "Verificación en dos pasos activada",
  TOTP_DISABLED: "Verificación en dos pasos desactivada",
  TOTP_RECOVERY_USED: "Acceso con código de recuperación",
  CLIENT_ANONYMIZED: "Cliente anonimizado (RGPD)",
};
