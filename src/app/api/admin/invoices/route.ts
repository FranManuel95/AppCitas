import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import {
  backfillInvoices,
  issueInvoiceForAppointment,
} from "@/lib/domain/invoices";
import { DomainError } from "@/lib/domain/errors";

const postSchema = z.union([
  // Emisión manual (p. ej. un cobro UNCOLLECTED cobrado luego en persona)
  z.object({ appointmentId: z.string().min(1) }),
  // Al activar la facturación: emitir las facturas del año que falten
  z.object({ backfill: z.literal(true) }),
]);

// GET /api/admin/invoices?year=2026[&format=csv] — listado del año
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();

  const invoices = await prisma.invoice.findMany({
    where: { businessId: admin.businessId, year },
    orderBy: [{ series: "asc" }, { number: "asc" }],
    take: 5000,
  });

  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv(
      [
        "Número",
        "Fecha",
        "Cliente",
        "Email",
        "Concepto",
        "Base",
        "IVA %",
        "Cuota IVA",
        "Total",
        "Estado",
      ],
      invoices.map((i) => [
        i.code,
        i.issuedAt.toISOString().slice(0, 10),
        i.clientName,
        i.clientEmail,
        i.concept,
        (i.baseCents / 100).toFixed(2),
        i.taxPercent,
        (i.taxCents / 100).toFixed(2),
        (i.totalCents / 100).toFixed(2),
        i.status === "RECTIFIED" ? "Rectificada" : "Emitida",
      ]),
    );
    return csvResponse(`facturas-${year}.csv`, csv);
  }

  return NextResponse.json({ invoices });
});

// POST /api/admin/invoices — emisión manual o backfill del año
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = postSchema.parse(await request.json());

  if ("backfill" in data) {
    const result = await backfillInvoices(admin.businessId);
    return NextResponse.json(result);
  }

  // Aislamiento: la cita debe ser de este negocio
  const appointment = await prisma.appointment.findFirst({
    where: { id: data.appointmentId, businessId: admin.businessId },
    select: { id: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }
  const invoice = await issueInvoiceForAppointment(data.appointmentId);
  if (!invoice) {
    throw new DomainError(
      "Esta cita no tiene un cobro facturable (o ya tiene factura)",
      "NOT_INVOICEABLE",
      409,
    );
  }
  return NextResponse.json({ invoice }, { status: 201 });
});
