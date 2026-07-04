import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { adminRemoveWaitlistEntry } from "@/lib/domain/waitlist";

// DELETE /api/admin/waitlist/[id] — el negocio quita una entrada de su lista.
export const DELETE = apiHandler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const result = await adminRemoveWaitlistEntry(admin.businessId, id);
    return NextResponse.json(result);
  },
);
