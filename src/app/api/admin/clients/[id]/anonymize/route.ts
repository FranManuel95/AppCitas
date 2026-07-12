import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { anonymizeGuestClient } from "@/lib/domain/gdpr";
import { audit } from "@/lib/audit";

// POST /api/admin/clients/[id]/anonymize — derecho al olvido de un cliente
// sin cuenta (sombra): lo pide en persona y el negocio lo ejecuta.
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();

    await anonymizeGuestClient({ businessId: admin.businessId, clientId: id });
    await audit("CLIENT_ANONYMIZED", {
      userId: admin.id,
      detail: `cliente ${id}`,
      request,
    });
    return NextResponse.json({ ok: true });
  },
);
