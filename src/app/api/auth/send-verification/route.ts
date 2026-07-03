import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/auth/mailer";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/auth/send-verification — reenvía el email de verificación al
// usuario autenticado.
export const POST = apiHandler(async (request: Request) => {
  const sessionUser = await apiRequireUser();
  await enforceRateLimit(
    request,
    "send-verification",
    { limit: 3, windowMs: 15 * 60_000 },
    sessionUser.id,
  );

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });

  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const token = await createAuthToken(user.id, "EMAIL_VERIFY", 24 * 60);
  await sendVerificationEmail({ to: user.email, name: user.name, token });

  return NextResponse.json({ ok: true });
});
