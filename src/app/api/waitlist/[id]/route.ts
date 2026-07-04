import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { leaveWaitlist } from "@/lib/domain/waitlist";

// DELETE /api/waitlist/[id] — el cliente se borra de una entrada suya.
export const DELETE = apiHandler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await apiRequireUser();
    const result = await leaveWaitlist(id, user.id);
    return NextResponse.json(result);
  },
);
