import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "./errors";
import { toLocalDateISO } from "./dates";
import { lockBusinessForInvoicing } from "./locks";
import { logError } from "@/lib/logger";

// Facturación fiscal de los cobros de citas: numeración correlativa SIN
// huecos por (negocio, serie, año). La factura es un snapshot inmutable del
// momento de emisión; si la cita se revierte después, se emite una
// rectificativa (serie R, importes en negativo) — nunca se borra ni se
// renumera. La emisión es siempre best-effort desde los flujos de cobro: un
// fallo al facturar se loguea pero JAMÁS rompe la operación de la cita.

const PAID_STATUSES = new Set(["CHARGED", "SIMULATED"]);

function invoiceCode(series: string, year: number, number: number): string {
  const num = String(number).padStart(6, "0");
  return series === "F" ? `${year}-${num}` : `${series}-${year}-${num}`;
}

/** Desglose IVA-incluido, mismo criterio que el recibo. */
function taxBreakdown(totalCents: number, taxPercent: number) {
  const baseCents = Math.round(totalCents / (1 + taxPercent / 100));
  return { baseCents, taxCents: totalCents - baseCents };
}

/** ¿Este desenlace de cita constituye un cobro facturable? */
export function isInvoiceableCharge(appointment: {
  status: string;
  chargedCents: number;
  paymentStatus: string;
  paymentMethod: string | null;
}): boolean {
  if (appointment.chargedCents <= 0) return false;
  if (appointment.status === "COMPLETED") {
    // Cobro presencial registrado (efectivo/TPV) o cargo online
    return appointment.paymentMethod !== null;
  }
  if (
    appointment.status === "NO_SHOW" ||
    appointment.status === "CANCELLED_LATE"
  ) {
    return PAID_STATUSES.has(appointment.paymentStatus);
  }
  return false;
}

function conceptFor(
  status: string,
  serviceName: string,
  viaMembership: boolean,
): string {
  // La membresía deja traza en el concepto: el descuento aplicado no es
  // arbitrario, viene del plan contratado por el cliente.
  const name = viaMembership ? `${serviceName} (membresía)` : serviceName;
  switch (status) {
    case "COMPLETED":
      return name;
    case "NO_SHOW":
      return `${name} · cargo por no presentarse`;
    case "CANCELLED_LATE":
      return `${name} · cargo por cancelación tardía`;
    default:
      return name;
  }
}

async function createInvoiceTx(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    appointmentId: string;
    series: "F" | "R";
    year: number;
    issuedAt: Date;
    snapshot: {
      businessName: string;
      businessTaxId: string | null;
      businessAddress: string | null;
      clientName: string;
      clientEmail: string;
      concept: string;
      currency: string;
      totalCents: number;
      taxPercent: number;
    };
    // Desglose explícito (rectificativas): la R debe NEGAR exactamente la
    // base/IVA de la F original; recalcular con Math.round es asimétrico en
    // negativos y puede desviar ±1 céntimo en importes frontera.
    breakdown?: { baseCents: number; taxCents: number };
    rectifiesId?: string;
  },
) {
  const counter = await tx.invoiceCounter.upsert({
    where: {
      businessId_series_year: {
        businessId: params.businessId,
        series: params.series,
        year: params.year,
      },
    },
    create: {
      businessId: params.businessId,
      series: params.series,
      year: params.year,
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  // Tras el upsert, nextNumber apunta al SIGUIENTE: el asignado es el previo
  const number = counter.nextNumber - 1;

  const { baseCents, taxCents } =
    params.breakdown ??
    taxBreakdown(params.snapshot.totalCents, params.snapshot.taxPercent);
  return tx.invoice.create({
    data: {
      businessId: params.businessId,
      appointmentId: params.appointmentId,
      series: params.series,
      year: params.year,
      number,
      code: invoiceCode(params.series, params.year, number),
      issuedAt: params.issuedAt,
      ...params.snapshot,
      baseCents,
      taxCents,
      rectifiesId: params.rectifiesId ?? null,
    },
  });
}

/**
 * Emite la factura del cobro de una cita (idempotente: si ya existe una
 * factura F vigente para la cita, no hace nada). Transacción propia bajo el
 * advisory lock de facturación.
 */
export async function issueInvoiceForAppointment(
  appointmentId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            taxId: true,
            taxPercent: true,
            address: true,
            currency: true,
            timezone: true,
            invoicingEnabled: true,
          },
        },
        service: { select: { name: true } },
        client: { select: { name: true, email: true } },
      },
    });
    if (!appointment) return null;
    if (!appointment.business.invoicingEnabled) return null;
    if (!isInvoiceableCharge(appointment)) return null;

    await lockBusinessForInvoicing(tx, appointment.businessId);

    // Idempotencia: una F vigente por cita
    const existing = await tx.invoice.findFirst({
      where: { appointmentId, series: "F", status: "ISSUED" },
      select: { id: true },
    });
    if (existing) return null;

    const year = Number(
      toLocalDateISO(now, appointment.business.timezone).slice(0, 4),
    );
    return createInvoiceTx(tx, {
      businessId: appointment.businessId,
      appointmentId,
      series: "F",
      year,
      issuedAt: now,
      snapshot: {
        businessName: appointment.business.name,
        businessTaxId: appointment.business.taxId,
        businessAddress: appointment.business.address,
        clientName: appointment.client.name,
        clientEmail: appointment.client.email,
        concept: conceptFor(
          appointment.status,
          appointment.service.name,
          !!appointment.membershipId,
        ),
        currency: appointment.business.currency,
        totalCents: appointment.chargedCents,
        taxPercent: appointment.business.taxPercent,
      },
    });
  });
}

/**
 * Rectificativa automática: cuando una cita FACTURADA revierte a un estado
 * sin cargo, se emite una serie R con el importe en negativo y la F pasa a
 * RECTIFIED. Idempotente (solo actúa sobre facturas F en estado ISSUED).
 */
export async function rectifyInvoicesForAppointment(
  appointmentId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { appointmentId, series: "F", status: "ISSUED" },
    });
    if (!invoice) return null;

    await lockBusinessForInvoicing(tx, invoice.businessId);

    const business = await tx.business.findUniqueOrThrow({
      where: { id: invoice.businessId },
      select: { timezone: true },
    });
    const year = Number(toLocalDateISO(now, business.timezone).slice(0, 4));
    const rectificative = await createInvoiceTx(tx, {
      businessId: invoice.businessId,
      appointmentId,
      series: "R",
      year,
      issuedAt: now,
      snapshot: {
        businessName: invoice.businessName,
        businessTaxId: invoice.businessTaxId,
        businessAddress: invoice.businessAddress,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        concept: `Rectificativa de ${invoice.code} · ${invoice.concept}`,
        currency: invoice.currency,
        totalCents: -invoice.totalCents,
        taxPercent: invoice.taxPercent,
      },
      // Negación exacta del desglose original (no recalcular).
      breakdown: {
        baseCents: -invoice.baseCents,
        taxCents: -invoice.taxCents,
      },
      rectifiesId: invoice.id,
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "RECTIFIED" },
    });
    return rectificative;
  });
}

/**
 * Hook best-effort para los flujos de cobro: emite o rectifica según el
 * estado resultante de la cita. Nunca lanza (la cita manda).
 */
export async function syncInvoiceForAppointment(
  appointment: {
    id: string;
    status: string;
    chargedCents: number;
    paymentStatus: string;
    paymentMethod: string | null;
  },
  now = new Date(),
): Promise<void> {
  try {
    if (isInvoiceableCharge(appointment)) {
      await issueInvoiceForAppointment(appointment.id, now);
    } else {
      await rectifyInvoicesForAppointment(appointment.id, now);
    }
  } catch (error) {
    logError("invoices.sync", error, { appointmentId: appointment.id });
  }
}

/**
 * Al activar la facturación: emite las facturas que faltan de los cobros del
 * año en curso, en orden de última actualización (mejor proxy del momento de
 * cobro). issuedAt = ahora para todas: la correlatividad es de emisión.
 */
export async function backfillInvoices(
  businessId: string,
  now = new Date(),
): Promise<{ issued: number }> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true, invoicingEnabled: true },
  });
  if (!business.invoicingEnabled) {
    throw new DomainError(
      "Activa primero la facturación en Ajustes",
      "INVOICING_DISABLED",
      409,
    );
  }
  const yearStart = new Date(
    `${toLocalDateISO(now, business.timezone).slice(0, 4)}-01-01T00:00:00Z`,
  );

  const candidates = await prisma.appointment.findMany({
    where: {
      businessId,
      chargedCents: { gt: 0 },
      updatedAt: { gte: yearStart },
      status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED_LATE"] },
      invoices: { none: { series: "F", status: "ISSUED" } },
    },
    select: {
      id: true,
      status: true,
      chargedCents: true,
      paymentStatus: true,
      paymentMethod: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 2000,
  });

  let issued = 0;
  for (const appointment of candidates) {
    if (!isInvoiceableCharge(appointment)) continue;
    const created = await issueInvoiceForAppointment(appointment.id, now);
    if (created) issued++;
  }
  return { issued };
}

/**
 * Reconciliación del cron: emite las facturas que un fallo dejó pendientes
 * (cobro registrado en los últimos 7 días sin factura). Best-effort.
 */
export async function issuePendingInvoices(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const candidates = await prisma.appointment.findMany({
    where: {
      chargedCents: { gt: 0 },
      updatedAt: { gte: since },
      status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED_LATE"] },
      business: { invoicingEnabled: true },
      invoices: { none: { series: "F", status: "ISSUED" } },
    },
    select: {
      id: true,
      status: true,
      chargedCents: true,
      paymentStatus: true,
      paymentMethod: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });

  let issued = 0;
  for (const appointment of candidates) {
    if (!isInvoiceableCharge(appointment)) continue;
    try {
      const created = await issueInvoiceForAppointment(appointment.id, now);
      if (created) issued++;
    } catch (error) {
      logError("invoices.pending", error, { appointmentId: appointment.id });
    }
  }
  return issued;
}
