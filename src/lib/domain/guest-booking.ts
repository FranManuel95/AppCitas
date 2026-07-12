import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";
import { createAppointment } from "./appointments";
import { findOrCreateGuestClient } from "./guest-clients";

// Reserva como invitado: sin cuenta ni contraseña, solo nombre + email (y
// teléfono opcional). Crea una cuenta sombra reclamable después. La gestión
// de la cita viaja en el enlace /c/{token} del email de confirmación.

export interface GuestBookingParams {
  businessId: string;
  serviceId: string;
  startAt: Date;
  staffId?: string;
  notes?: string;
  couponCode?: string;
  guest: { name: string; email: string; phone?: string };
  // Checkbox de términos/privacidad (RGPD): obligatorio.
  consent: boolean;
  now?: Date;
}

export async function createGuestAppointment(params: GuestBookingParams) {
  if (!params.consent) {
    throw new DomainError(
      "Debes aceptar la política de privacidad y los términos",
      "CONSENT_REQUIRED",
    );
  }

  const business = await prisma.business.findFirst({
    where: { id: params.businessId, active: true },
    select: { requireCardToBook: true },
  });
  if (!business) {
    throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  }
  // La tarjeta como garantía exige cuenta (el SetupIntent vive en el cliente
  // de Stripe del usuario): permitir invitados aquí vaciaría la política.
  if (business.requireCardToBook) {
    throw new DomainError(
      "Este negocio requiere una tarjeta guardada: crea una cuenta para reservar",
      "CARD_REQUIRED_ACCOUNT",
      409,
    );
  }

  const { clientId } = await findOrCreateGuestClient({
    name: params.guest.name,
    email: params.guest.email,
    phone: params.guest.phone,
    // Sin sesión NUNCA se reserva sobre una cuenta reclamada (suplantación):
    // findOrCreateGuestClient responde 409 EMAIL_HAS_ACCOUNT en ese caso.
    allowClaimedAccounts: false,
    consent: true,
    now: params.now,
  });

  return createAppointment({
    businessId: params.businessId,
    serviceId: params.serviceId,
    clientId,
    startAt: params.startAt,
    staffId: params.staffId,
    notes: params.notes,
    couponCode: params.couponCode,
    now: params.now,
  });
}
