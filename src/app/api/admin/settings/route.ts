import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { normalizeCustomDomain } from "@/lib/custom-domain";
import { validateTemplateOverrides } from "@/lib/notifications/templates";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  category: z.string().trim().max(50).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  // Visibilidad en el marketplace (false = solo enlace directo/QR)
  listedInMarketplace: z.boolean().optional(),
  // Política de reservas y cancelación
  cancellationWindowHours: z.number().int().min(0).max(24 * 30).optional(),
  lateCancellationFeePercent: z.number().int().min(0).max(100).optional(),
  // Descuento automático de última hora (reservas que empiezan en <24 h)
  lastMinuteDiscountPercent: z.number().int().min(0).max(90).optional(),
  slotGranularityMinutes: z.number().int().min(5).max(120).optional(),
  maxAdvanceBookingDays: z.number().int().min(1).max(365).optional(),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
  // Zona horaria IANA (se valida abajo con Intl) y moneda de cobro. Cambiar
  // la zona reinterpreta los horarios HH:mm del negocio; las citas existentes
  // conservan su instante UTC.
  timezone: z.string().trim().min(1).max(64).optional(),
  currency: z
    .enum(["EUR", "USD", "GBP", "CHF", "MXN", "ARS", "CLP", "COP", "PEN", "BRL"])
    .optional(),
  // Pagos
  requireCardToBook: z.boolean().optional(),
  // Señal (prepago) al reservar: % del precio, 0 = desactivada
  depositPercent: z.number().int().min(0).max(100).optional(),
  // Recordatorios y canales
  remindersEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(24 * 14).optional(),
  // Segundo recordatorio más cercano a la cita (null = desactivado)
  reminder2HoursBefore: z.number().int().min(1).max(168).nullable().optional(),
  // Cierre automático de citas pasadas (CONFIRMED → COMPLETED tras 24 h)
  autoCompleteEnabled: z.boolean().optional(),
  // Win-back: días tras la última cita para el aviso "vuelve a reservar"
  // (null = desactivado)
  winbackDays: z.number().int().min(7).max(365).nullable().optional(),
  notifyByEmail: z.boolean().optional(),
  notifyBySms: z.boolean().optional(),
  notifyByWhatsapp: z.boolean().optional(),
  // Facturación de recibos
  taxId: z.string().trim().max(30).nullable().optional(),
  taxPercent: z.number().int().min(0).max(50).optional(),
  // Facturas fiscales numeradas (exige NIF/CIF relleno; se valida abajo)
  invoicingEnabled: z.boolean().optional(),
  // Textos propios de los mensajes (JSON por plantilla; se valida abajo con
  // validateTemplateOverrides: claves y variables conocidas, longitud máx.)
  notificationTemplates: z.unknown().optional(),
  // Dominio propio (Pro; se normaliza y valida abajo)
  customDomain: z.string().trim().max(253).nullable().optional(),
  // Marca en la página pública y el widget
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  logoUrl: z.url().startsWith("https://").max(300).nullable().optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    include: { hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] } },
  });
  return NextResponse.json({ business });
});

export const PATCH = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const { notificationTemplates, customDomain, ...data } = updateSchema.parse(
    await request.json(),
  );

  // Dominio propio: normaliza (quita https:// y rutas), valida el formato y
  // exige plan Pro. La unicidad la garantiza el índice (409 si está en uso).
  let domainUpdate: { customDomain: string | null } | undefined;
  if (customDomain !== undefined) {
    if (customDomain === null || customDomain === "") {
      domainUpdate = { customDomain: null };
    } else {
      const normalized = normalizeCustomDomain(customDomain);
      if (!normalized) {
        throw new DomainError(
          "Dominio no válido (ejemplo: reservas.tunegocio.com)",
          "DOMAIN_INVALID",
          422,
        );
      }
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: admin.businessId },
        select: { plan: true },
      });
      if (business.plan !== "pro") {
        throw new DomainError(
          "El dominio propio es una función del plan Pro",
          "DOMAIN_REQUIRES_PRO",
          402,
        );
      }
      const taken = await prisma.business.findFirst({
        where: { customDomain: normalized, id: { not: admin.businessId } },
        select: { id: true },
      });
      if (taken) {
        throw new DomainError(
          "Ese dominio ya está en uso por otro negocio",
          "DOMAIN_TAKEN",
          409,
        );
      }
      domainUpdate = { customDomain: normalized };
    }
  }

  // Textos propios de los mensajes: se validan (claves/variables conocidas,
  // longitudes) y se guardan como JSON; objeto vacío = volver a los textos
  // por defecto (null).
  let templatesUpdate: { notificationTemplates: string | null } | undefined;
  if (notificationTemplates !== undefined) {
    const result = validateTemplateOverrides(notificationTemplates);
    if (!result.ok) {
      throw new DomainError(result.error, "TEMPLATE_INVALID", 422);
    }
    templatesUpdate = {
      notificationTemplates: result.value ? JSON.stringify(result.value) : null,
    };
  }

  // Zona horaria: cualquier identificador IANA que Intl acepte (incl. alias)
  if (data.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: data.timezone });
    } catch {
      throw new DomainError(
        "Zona horaria no válida (ejemplo: Europe/Madrid)",
        "TIMEZONE_INVALID",
        422,
      );
    }
  }

  // Una factura sin NIF/CIF del emisor no es válida: la activación exige
  // taxId (el que llega en esta misma petición o el ya guardado).
  if (data.invoicingEnabled) {
    const effectiveTaxId =
      data.taxId !== undefined
        ? data.taxId
        : (
            await prisma.business.findUniqueOrThrow({
              where: { id: admin.businessId },
              select: { taxId: true },
            })
          ).taxId;
    if (!effectiveTaxId) {
      throw new DomainError(
        "Para emitir facturas rellena primero el NIF/CIF",
        "INVOICING_NEEDS_TAX_ID",
        422,
      );
    }
  }

  const business = await prisma.business.update({
    where: { id: admin.businessId },
    data: { ...data, ...templatesUpdate, ...domainUpdate },
  });
  return NextResponse.json({ business });
});
