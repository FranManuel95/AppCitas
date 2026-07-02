import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendStaffInviteEmail } from "@/lib/auth/mailer";
import { DomainError } from "@/lib/domain/errors";
import { audit } from "@/lib/audit";

// POST /api/admin/staff/[id]/access — invita al empleado a su portal:
// crea su cuenta (rol STAFF) con contraseña aleatoria y le envía un enlace
// para establecer la suya (mismo mecanismo de un solo uso que el reset).
export const POST = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();

    const member = await prisma.staffMember.findFirst({
      where: { id, businessId: admin.businessId },
      include: { business: { select: { name: true } } },
    });
    if (!member) {
      throw new DomainError("Empleado no encontrado", "STAFF_NOT_FOUND", 404);
    }
    if (member.userId) {
      throw new DomainError("Este empleado ya tiene acceso", "ALREADY_INVITED", 409);
    }
    if (!member.email) {
      throw new DomainError(
        "Añade primero un email al empleado para poder invitarle",
        "EMAIL_REQUIRED",
      );
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email: member.email.toLowerCase() },
      select: { id: true },
    });
    if (emailTaken) {
      throw new DomainError(
        "Ya existe una cuenta con ese email; usa otro email para el empleado",
        "EMAIL_TAKEN",
        409,
      );
    }

    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: member.email!.toLowerCase(),
          name: member.name,
          phone: member.phone,
          role: "STAFF",
          businessId: admin.businessId,
          // Contraseña aleatoria: se sustituye con el enlace de invitación
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        },
      });
      await tx.staffMember.update({
        where: { id: member.id },
        data: { userId: user.id },
      });
      return user;
    });

    // Enlace para establecer contraseña (48 h)
    const token = await createAuthToken(user.id, "PASSWORD_RESET", 48 * 60);
    await sendStaffInviteEmail({
      to: user.email,
      name: user.name,
      businessName: member.business.name,
      token,
    });
    await audit("STAFF_INVITED", {
      userId: admin.id,
      email: user.email,
      detail: `empleado: ${member.name}`,
    });

    return NextResponse.json({ invited: true, email: user.email }, { status: 201 });
  },
);
