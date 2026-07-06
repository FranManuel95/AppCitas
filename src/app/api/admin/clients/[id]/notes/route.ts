import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { addClientNote } from "@/lib/domain/clients";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

// POST /api/admin/clients/[id]/notes — nota privada del negocio sobre el cliente
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const { text } = bodySchema.parse(await request.json());

    const note = await addClientNote({
      businessId: admin.businessId,
      clientId: id,
      text,
      authorName: admin.name,
    });
    return NextResponse.json({ note }, { status: 201 });
  },
);
