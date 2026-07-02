import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";

const schema = z.object({
  ownerName: z.string().trim().min(2).max(100),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(100),
  businessName: z.string().trim().min(2).max(100),
  category: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(30).optional(),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const POST = apiHandler(async (request: Request) => {
  const data = schema.parse(await request.json());

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("Ya existe una cuenta con este email", "EMAIL_TAKEN", 409);
  }

  // Slug único: si está ocupado se añade un sufijo numérico
  const base = slugify(data.businessName) || "negocio";
  let slug = base;
  for (let i = 2; ; i++) {
    const taken = await prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) break;
    slug = `${base}-${i}`;
  }

  const passwordHash = await hashPassword(data.password);

  // El horario semanal inicial (L-V 9:00-18:00) es editable desde el panel.
  const { user, business } = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        slug,
        name: data.businessName,
        category: data.category?.trim() || "general",
        phone: data.phone || null,
        email: data.email,
        hours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            openTime: "09:00",
            closeTime: "18:00",
          })),
        },
      },
    });
    const user = await tx.user.create({
      data: {
        name: data.ownerName,
        email: data.email,
        passwordHash,
        role: "OWNER",
        businessId: business.id,
      },
    });
    return { user, business };
  });

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: "OWNER",
    businessId: business.id,
  });

  return NextResponse.json(
    { business: { id: business.id, slug: business.slug, name: business.name } },
    { status: 201 },
  );
});
