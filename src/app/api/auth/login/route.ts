import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import type { Role } from "@/lib/domain/types";

const schema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export const POST = apiHandler(async (request: Request) => {
  const { email, password } = schema.parse(await request.json());

  const user = await prisma.user.findUnique({ where: { email } });
  // Mismo error para email inexistente y contraseña errónea: no revela cuentas
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new DomainError("Credenciales incorrectas", "BAD_CREDENTIALS", 401);
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    businessId: user.businessId,
  });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    },
  });
});
