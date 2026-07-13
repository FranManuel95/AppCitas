import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment, setAppointmentStatus } from "../appointments";
import { backfillInvoices, issueInvoiceForAppointment } from "../invoices";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

async function enableInvoicing(businessId: string) {
  await prisma.business.update({
    where: { id: businessId },
    data: { invoicingEnabled: true, taxId: "B12345678", taxPercent: 21 },
  });
}

async function bookAndComplete(
  businessId: string,
  serviceId: string,
  clientId: string,
  startAt: Date,
) {
  const appt = await createAppointment({
    businessId,
    serviceId,
    clientId,
    startAt,
    now: NOW,
  });
  await setAppointmentStatus({
    appointmentId: appt.id,
    businessId,
    status: "COMPLETED",
    paymentMethod: "CASH",
    now: NOW,
  });
  return appt;
}

// Facturación fiscal: numeración correlativa por (negocio, serie, año),
// emisión automática al cobrar, rectificativa al revertir, snapshot inmutable.
describe("facturas fiscales (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("cada cobro emite su factura correlativa (2026-000001, 000002…)", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    await enableInvoicing(businessId);
    const clientId = await seedClient();

    await bookAndComplete(businessId, serviceId, clientId, slotAt("2026-07-14", "10:00"));
    await bookAndComplete(businessId, serviceId, clientId, slotAt("2026-07-14", "12:00"));

    const invoices = await prisma.invoice.findMany({
      where: { businessId },
      orderBy: { number: "asc" },
    });
    expect(invoices).toHaveLength(2);
    expect(invoices[0].code).toBe("2026-000001");
    expect(invoices[1].code).toBe("2026-000002");
    // Desglose IVA incluido: 20 € al 21 % → base 16,53, cuota 3,47
    expect(invoices[0].totalCents).toBe(2000);
    expect(invoices[0].baseCents).toBe(1653);
    expect(invoices[0].taxCents).toBe(347);
  });

  it("sin facturación activada o sin cargo, no se numera nada", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();

    // Facturación desactivada: completar con cobro no emite
    await bookAndComplete(businessId, serviceId, clientId, slotAt("2026-07-14", "10:00"));
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(0);

    // Activada pero cita cancelada en plazo (cargo 0): tampoco
    await enableInvoicing(businessId);
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "CANCELLED",
      now: NOW,
    });
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(0);
  });

  it("es idempotente: reemitir la misma cita no duplica", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await enableInvoicing(businessId);
    const clientId = await seedClient();
    const appt = await bookAndComplete(
      businessId,
      serviceId,
      clientId,
      slotAt("2026-07-14", "10:00"),
    );

    const second = await issueInvoiceForAppointment(appt.id, NOW);
    expect(second).toBeNull();
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(1);
  });

  it("revertir una cita facturada emite rectificativa en negativo", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 3000 });
    await enableInvoicing(businessId);
    const clientId = await seedClient();
    const appt = await bookAndComplete(
      businessId,
      serviceId,
      clientId,
      slotAt("2026-07-14", "10:00"),
    );

    await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "CONFIRMED",
      now: NOW,
    });

    const invoices = await prisma.invoice.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });
    expect(invoices).toHaveLength(2);
    expect(invoices[0].series).toBe("F");
    expect(invoices[0].status).toBe("RECTIFIED");
    expect(invoices[1].series).toBe("R");
    expect(invoices[1].code).toBe("R-2026-000001");
    expect(invoices[1].totalCents).toBe(-3000);
    expect(invoices[1].rectifiesId).toBe(invoices[0].id);

    // Re-completar re-factura con el siguiente número de la serie F
    await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "COMPLETED",
      paymentMethod: "CASH",
      now: NOW,
    });
    const newF = await prisma.invoice.findFirst({
      where: { businessId, series: "F", status: "ISSUED" },
    });
    expect(newF?.code).toBe("2026-000002");
  });

  it("el concepto deja traza de la membresía que abarató la cita", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    await enableInvoicing(businessId);
    const clientId = await seedClient();
    const plan = await prisma.membershipPlan.create({
      data: { businessId, name: "Socio", priceCents: 1990, discountPercent: 25 },
    });
    const membership = await prisma.clientMembership.create({
      data: {
        businessId,
        planId: plan.id,
        clientId,
        status: "active",
        currentPeriodEnd: new Date(NOW.getTime() + 30 * 86_400_000),
        paymentSimulated: true,
      },
    });

    // La reserva aplica el beneficio (membershipId en la cita) y al
    // completarla se emite la factura con el sufijo en el concepto
    await bookAndComplete(businessId, serviceId, clientId, slotAt("2026-07-14", "10:00"));
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { businessId, series: "F" },
    });
    expect(invoice.concept).toContain("(membresía)");

    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { businessId },
      select: { membershipId: true },
    });
    expect(appointment.membershipId).toBe(membership.id);
  });

  it("backfill: factura los cobros del año que no tenían factura", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    // Cobro registrado ANTES de activar la facturación
    await bookAndComplete(businessId, serviceId, clientId, slotAt("2026-07-14", "10:00"));
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(0);

    await enableInvoicing(businessId);
    const { issued } = await backfillInvoices(businessId, NOW);
    expect(issued).toBe(1);
    // Repetirlo no duplica
    const again = await backfillInvoices(businessId, NOW);
    expect(again.issued).toBe(0);
  });
});
