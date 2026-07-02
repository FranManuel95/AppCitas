import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/mailer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.email().toLowerCase() });

// POST /api/auth/forgot-password — siempre responde ok: no revela si la
// cuenta existe. Si existe, envía el enlace de restablecimiento (30 min).
export const POST = apiHandler(async (request: Request) => {
  const { email } = schema.parse(await request.json());
  enforceRateLimit(
    request,
    "forgot-password",
    { limit: 3, windowMs: 15 * 60_000 },
    email,
  );

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (user) {
    try {
      const token = await createAuthToken(user.id, "PASSWORD_RESET", 30);
      await sendPasswordResetEmail({ to: user.email, name: user.name, token });
      await audit("PASSWORD_RESET_REQUESTED", {
        userId: user.id,
        email,
        request,
      });
    } catch (error) {
      console.error("[forgot-password] error enviando email:", error);
    }
  }

  return NextResponse.json({ ok: true });
});
