import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { cancelMembership } from "@/lib/payments/memberships";

// DELETE /api/memberships/[id] — baja de la membresía propia. El beneficio se
// mantiene hasta el fin del periodo ya pagado (cancel_at_period_end).
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await apiRequireUser();
    const { id } = await params;
    const membership = await cancelMembership({
      clientId: user.id,
      membershipId: id,
    });
    return NextResponse.json({
      membership: {
        id: membership.id,
        status: membership.status,
        cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
        currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
      },
    });
  },
);
