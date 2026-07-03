import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { createReview } from "@/lib/domain/reviews";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

// POST /api/appointments/[id]/review
// El cliente valora su cita COMPLETED (una sola vez, 1-5 estrellas).
export const POST = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const user = await apiRequireUser();
    // Por usuario (no por IP): dos clientes tras la misma IP NAT no comparten
    // cupo.
    await enforceRateLimit(
      request,
      "review",
      { limit: 10, windowMs: 3_600_000 },
      user.id,
    );
    const { rating, comment } = bodySchema.parse(await request.json());

    const review = await createReview({
      appointmentId: id,
      clientId: user.id,
      rating,
      comment,
    });

    return NextResponse.json(
      { review: { id: review.id, rating: review.rating } },
      { status: 201 },
    );
  },
);
