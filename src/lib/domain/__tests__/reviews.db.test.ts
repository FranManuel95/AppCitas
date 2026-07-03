import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createReview } from "../reviews";
import { DomainError } from "../errors";
import {
  resetDb,
  seedBusiness,
  seedClient,
  slotAt,
} from "@/lib/test/factories";

// Tests con BD real (SQLite temporal) de createReview: cubren la carrera P2002
// (dos valoraciones simultáneas de la misma cita) que los tests puros no ven.

async function completedAppointment() {
  const { businessId, serviceId } = await seedBusiness();
  const clientId = await seedClient();
  const start = slotAt("2020-01-06", "10:00"); // cita pasada y COMPLETED
  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      serviceId,
      clientId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      status: "COMPLETED",
      priceCents: 1000,
      confirmationToken: `tok-${start.getTime()}`,
    },
  });
  return { appointmentId: appointment.id, clientId };
}

describe("createReview (BD)", () => {
  beforeEach(resetDb);

  it("crea la valoración de una cita completada", async () => {
    const { appointmentId, clientId } = await completedAppointment();
    const review = await createReview({
      appointmentId,
      clientId,
      rating: 5,
      comment: "Genial",
    });
    expect(review.rating).toBe(5);
    expect(await prisma.review.count()).toBe(1);
  });

  it("rechaza una segunda valoración con 409 (unicidad appointmentId)", async () => {
    const { appointmentId, clientId } = await completedAppointment();
    await createReview({ appointmentId, clientId, rating: 4 });

    await expect(
      createReview({ appointmentId, clientId, rating: 3 }),
    ).rejects.toMatchObject({ code: "ALREADY_REVIEWED", httpStatus: 409 });
    expect(await prisma.review.count()).toBe(1);
  });

  it("ante dos valoraciones simultáneas, solo una gana (carrera P2002)", async () => {
    const { appointmentId, clientId } = await completedAppointment();

    const results = await Promise.allSettled([
      createReview({ appointmentId, clientId, rating: 5 }),
      createReview({ appointmentId, clientId, rating: 1 }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DomainError,
    );
    expect(await prisma.review.count()).toBe(1);
  });
});
