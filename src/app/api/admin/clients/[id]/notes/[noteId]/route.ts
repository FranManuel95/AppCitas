import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { deleteClientNote } from "@/lib/domain/clients";

// DELETE /api/admin/clients/[id]/notes/[noteId]
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string; noteId: string }> },
  ) => {
    const { noteId } = await params;
    const admin = await apiRequireBusinessAdmin();
    await deleteClientNote({ businessId: admin.businessId, noteId });
    return NextResponse.json({ ok: true });
  },
);
