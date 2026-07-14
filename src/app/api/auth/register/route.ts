import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendClaimAccountEmail, sendVerificationEmail } from "@/lib/auth/mailer";
import { getLocale } from "@/lib/i18n";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().max(30).optional(),
});

export const POST = apiHandler(async (request: Request) => {
  await enforceRateLimit(request, "register", { limit: 5, windowMs: 60 * 60_000 });
  const data = schema.parse(await request.json());

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, name: true, guest: true },
  });
  if (existing?.guest) {
    // Reservó antes como invitado: la cuenta existe sin contraseña. NUNCA se
    // abre sesión directa (sería apropiarse del historial de otro con solo
    // teclear su email): se demuestra la posesión del email vía enlace.
    try {
      const token = await createAuthToken(existing.id, "PASSWORD_RESET", 30);
      await sendClaimAccountEmail({
        to: data.email,
        name: existing.name,
        token,
      });
    } catch (error) {
      console.error("[register] no se pudo enviar el reclamo:", error);
    }
    throw new DomainError(
      "Ya habías reservado como invitado con este email. Te hemos enviado un enlace para elegir tu contraseña y activar la cuenta.",
      "CLAIM_EMAIL_SENT",
      409,
    );
  }
  if (existing) {
    throw new DomainError("Ya existe una cuenta con este email", "EMAIL_TAKEN", 409);
  }

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      passwordHash: await hashPassword(data.password),
      role: "CLIENT",
      // Consentimiento de términos y privacidad aceptado al registrarse.
      consentedAt: new Date(),
      // Idioma actual de la interfaz: las notificaciones saldrán en él
      locale: await getLocale(),
    },
  });

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: "CLIENT",
    businessId: null,
  });

  await audit("REGISTER", { userId: user.id, email: user.email, request });

  // Verificación de email: el fallo de envío no bloquea el registro
  try {
    const token = await createAuthToken(user.id, "EMAIL_VERIFY", 24 * 60);
    await sendVerificationEmail({ to: user.email, name: user.name, token });
  } catch (error) {
    console.error("[register] no se pudo enviar la verificación:", error);
  }

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    { status: 201 },
  );
});
