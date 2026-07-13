import { prisma } from "@/lib/prisma";
import {
  chooseStaffId,
  computeDaySlots,
  computeStaffDaySlots,
  isOfferedSlot,
  type SlotEngineInput,
  type StaffAgendaContext,
  type StaffSlot,
} from "./availability";
import { cancellationDeadline, evaluateCancellation } from "./cancellation";
import { DomainError } from "./errors";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  wallTimeToUtc,
} from "./dates";
import {
  BLOCKING_STATUSES,
  type AppointmentStatus,
  type InPersonPaymentMethod,
} from "./types";
import { lockBusinessForBooking } from "./locks";
import { assertAppointmentWithinPlanTx } from "./plans";
import {
  fulfillWaitlistOnBooking,
  notifyWaitlistForFreedSlot,
} from "./waitlist";
import {
  couponDiscountCents,
  couponRejection,
  packageRejection,
} from "./promotions";
import {
  collectAppointmentCharge,
  collectBookingDeposit,
  refundCollectedPayment,
} from "@/lib/payments/collect";
import { logError } from "@/lib/logger";
import {
  enqueueBookingNotifications,
  enqueueCancellationNotifications,
  enqueueNoShowNotification,
} from "@/lib/notifications/service";
import { syncInvoiceForAppointment } from "./invoices";
import { syncLoyaltyForStatusChange } from "./loyalty";
import { activeMembershipBenefitTx } from "./memberships";
import { getExternalBusy } from "@/lib/calendar/freebusy";
import { enqueueCalendarSync } from "@/lib/calendar/sync";

interface AvailabilityContext {
  business: {
    id: string;
    timezone: string;
    slotGranularityMinutes: number;
    minNoticeMinutes: number;
    maxAdvanceBookingDays: number;
    hours: Array<{ weekday: number; openTime: string; closeTime: string }>;
    closedDates: string[];
  };
  service: { id: string; durationMinutes: number; priceCents: number };
  // Empleados activos cualificados para el servicio (vacío = negocio sin equipo)
  staff: StaffAgendaContext[];
  // Carga del día por empleado (para asignación automática)
  dayLoadByStaff: Map<string, number>;
  engineBase: Omit<SlotEngineInput, "busy" | "hours">;
  // Solo para negocios sin equipo: ocupación a nivel de negocio
  businessBusy: Array<{ startAt: Date; endAt: Date }>;
}

async function loadAvailabilityContext(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  now: Date;
  staffId?: string;
  // Multi-sede: pre-filtra el equipo a la sede pedida (los empleados con
  // locationId null trabajan en todas). El motor de huecos no cambia y el
  // conflicto transaccional sigue siendo por persona.
  locationId?: string;
  // Al reprogramar: la propia cita no bloquea su hueco (queda libre al moverla)
  excludeAppointmentId?: string;
  // El negocio se apunta citas de mostrador/teléfono "para ahora mismo": la
  // antelación mínima que protege al negocio no aplica cuando reserva él.
  relaxMinNotice?: boolean;
}): Promise<AvailabilityContext> {
  const { businessId, serviceId, dateISO, now, staffId, excludeAppointmentId } =
    params;

  if (!isValidDateISO(dateISO)) {
    throw new DomainError("Fecha no válida", "INVALID_DATE");
  }

  const [business, service] = await Promise.all([
    prisma.business.findFirst({
      where: { id: businessId, active: true },
      include: { hours: true, closures: { where: { date: dateISO } } },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
    }),
  ]);

  if (!business) throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  if (!service) throw new DomainError("Servicio no encontrado", "SERVICE_NOT_FOUND", 404);

  // Empleados activos que realizan este servicio (sin filas de servicios
  // asignados = los realiza todos)
  const staffMembers = await prisma.staffMember.findMany({
    where: {
      businessId,
      active: true,
      ...(staffId ? { id: staffId } : {}),
      OR: [{ services: { none: {} } }, { services: { some: { serviceId } } }],
      ...(params.locationId
        ? {
            AND: [
              {
                OR: [
                  { locationId: null },
                  { locationId: params.locationId },
                ],
              },
            ],
          }
        : {}),
    },
    include: { hours: true },
  });

  if (staffId && staffMembers.length === 0) {
    throw new DomainError(
      "Ese profesional no está disponible para este servicio",
      "STAFF_NOT_AVAILABLE",
      404,
    );
  }

  // Intervalo UTC que cubre el día local del negocio
  const dayStart = wallTimeToUtc(dateISO, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(dateISO, 1), "00:00", business.timezone);

  // Ausencias (vacaciones/baja) que cubren este día: el empleado sigue en el
  // contexto pero con el día entero ocupado, así ni se le asignan citas en
  // "cualquier profesional" ni ofrece huecos si se le pide explícitamente.
  const absentStaffIds = new Set(
    staffMembers.length > 0
      ? (
          await prisma.staffTimeOff.findMany({
            where: {
              staffId: { in: staffMembers.map((m) => m.id) },
              startDate: { lte: dateISO },
              endDate: { gte: dateISO },
            },
            select: { staffId: true },
          })
        ).map((t) => t.staffId)
      : [],
  );

  const dayAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: [...BLOCKING_STATUSES] },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startAt: true, endAt: true, staffId: true },
  });

  // Ocupación externa (Google Calendar entrante): el "ocupado" personal del
  // calendario conectado bloquea la oferta de huecos. Fail-open (un fallo de
  // Google devuelve vacío) y barato sin conexiones. La conexión de nivel
  // negocio solo bloquea la agenda única (sin equipo); con equipo, cada
  // empleado bloquea con SU calendario.
  const externalBusy = await getExternalBusy({
    businessId,
    dateISO,
    dayStart,
    dayEnd,
    now,
  });

  const dayLoadByStaff = new Map<string, number>();
  for (const a of dayAppointments) {
    if (a.staffId) {
      dayLoadByStaff.set(a.staffId, (dayLoadByStaff.get(a.staffId) ?? 0) + 1);
    }
  }

  // Las citas sin empleado (creadas cuando el negocio no tenía equipo, o de
  // sala única) bloquean la agenda de todos los empleados.
  const unassignedBusy = dayAppointments.filter((a) => !a.staffId);

  const minNoticeMinutes = params.relaxMinNotice
    ? 0
    : business.minNoticeMinutes;

  return {
    business: {
      id: business.id,
      timezone: business.timezone,
      slotGranularityMinutes: business.slotGranularityMinutes,
      minNoticeMinutes,
      maxAdvanceBookingDays: business.maxAdvanceBookingDays,
      hours: business.hours,
      closedDates: business.closures.map((c) => c.date),
    },
    service: {
      id: service.id,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
    },
    staff: staffMembers.map((m) => ({
      id: m.id,
      hours: m.hours,
      busy: [
        ...(absentStaffIds.has(m.id)
          ? [{ startAt: dayStart, endAt: dayEnd }]
          : []),
        ...dayAppointments
          .filter((a) => a.staffId === m.id)
          .map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
        ...unassignedBusy.map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
        ...(externalBusy.byStaff.get(m.id) ?? []),
      ],
    })),
    dayLoadByStaff,
    engineBase: {
      dateISO,
      timezone: business.timezone,
      closedDates: business.closures.map((c) => c.date),
      durationMinutes: service.durationMinutes,
      granularityMinutes: business.slotGranularityMinutes,
      minNoticeMinutes,
      maxAdvanceBookingDays: business.maxAdvanceBookingDays,
      now,
    },
    businessBusy: [
      ...dayAppointments.map((a) => ({
        startAt: a.startAt,
        endAt: a.endAt,
      })),
      ...externalBusy.businessLevel,
    ],
  };
}

function slotsFromContext(ctx: AvailabilityContext): StaffSlot[] {
  if (ctx.staff.length > 0) {
    return computeStaffDaySlots(ctx.engineBase, ctx.business.hours, ctx.staff);
  }
  // Negocio sin equipo: agenda única (capacidad 1)
  return computeDaySlots({
    ...ctx.engineBase,
    hours: ctx.business.hours,
    busy: ctx.businessBusy,
  }).map((s) => ({ ...s, staffIds: [] }));
}

export async function getAvailability(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  staffId?: string;
  locationId?: string;
  now?: Date;
  relaxMinNotice?: boolean;
}): Promise<StaffSlot[]> {
  const ctx = await loadAvailabilityContext({
    ...params,
    now: params.now ?? new Date(),
  });
  return slotsFromContext(ctx);
}

// Ventana del "descuento de última hora": reservas que empiezan dentro de
// estas horas reciben el % configurado por el negocio.
export const LAST_MINUTE_WINDOW_HOURS = 24;

export async function createAppointment(params: {
  businessId: string;
  serviceId: string;
  clientId: string;
  startAt: Date;
  staffId?: string;
  // Multi-sede: sede elegida (filtra el equipo y queda como snapshot)
  locationId?: string;
  notes?: string;
  couponCode?: string;
  clientPackageId?: string;
  // Quién reserva: el cliente (por defecto) o el propio negocio (mostrador/
  // teléfono). El negocio salta la antelación mínima y no cobra señal (el
  // walk-in paga en persona); el cupo del plan se aplica igual.
  bookedBy?: "client" | "business";
  // Serie recurrente: las ocurrencias comparten seriesId, y a partir de la
  // segunda no se envía la confirmación inmediata (los recordatorios sí).
  seriesId?: string;
  suppressConfirmation?: boolean;
  now?: Date;
}) {
  const bookedBy = params.bookedBy ?? "client";
  const now = params.now ?? new Date();
  const {
    businessId,
    serviceId,
    clientId,
    startAt,
    staffId,
    notes,
    couponCode,
    clientPackageId,
  } = params;

  if (couponCode && clientPackageId) {
    throw new DomainError(
      "No se puede combinar un cupón con un bono",
      "PROMO_CONFLICT",
    );
  }

  const businessRow = await prisma.business.findFirst({
    where: { id: businessId, active: true },
    select: { timezone: true, lastMinuteDiscountPercent: true },
  });
  if (!businessRow) {
    throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  }

  // Sede: debe ser del negocio y estar activa (si se indica)
  let locationId: string | null = null;
  if (params.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: params.locationId, businessId, active: true },
      select: { id: true },
    });
    if (!location) {
      throw new DomainError("Sede no encontrada", "LOCATION_NOT_FOUND", 404);
    }
    locationId = location.id;
  }

  const dateISO = toLocalDateISO(startAt, businessRow.timezone);
  const ctx = await loadAvailabilityContext({
    businessId,
    serviceId,
    dateISO,
    now,
    staffId,
    locationId: locationId ?? undefined,
    relaxMinNotice: bookedBy === "business",
  });

  // Solo se aceptan instantes exactamente ofertados por el motor de huecos:
  // valida horario, antelaciones, cierres y solapamientos.
  const slot = slotsFromContext(ctx).find(
    (s) => s.start.getTime() === startAt.getTime(),
  );
  if (!slot) {
    throw new DomainError(
      "El horario seleccionado ya no está disponible",
      "SLOT_UNAVAILABLE",
      409,
    );
  }

  // Con equipo: usa el empleado pedido o asigna el menos cargado del hueco
  const hasStaff = ctx.staff.length > 0;
  const assignedStaffId = hasStaff
    ? (staffId ?? chooseStaffId(slot.staffIds, ctx.dayLoadByStaff))
    : null;
  if (hasStaff && !assignedStaffId) {
    throw new DomainError(
      "No hay profesionales disponibles en ese horario",
      "SLOT_UNAVAILABLE",
      409,
    );
  }

  const endAt = new Date(
    startAt.getTime() + ctx.service.durationMinutes * 60_000,
  );

  // Transacción: re-comprueba el solapamiento justo antes de insertar para
  // cerrar la carrera entre dos reservas simultáneas del mismo hueco, y
  // consume la promoción (cupón/bono) de forma atómica con la reserva.
  const appointment = await prisma.$transaction(async (tx) => {
    // Serializa las reservas concurrentes del negocio antes del chequeo de
    // solapamiento: bajo READ COMMITTED el findFirst no ve las inserciones de
    // otra transacción en vuelo. No-op en SQLite. Ver src/lib/domain/locks.ts.
    await lockBusinessForBooking(tx, businessId);
    // Cupo del plan comprobado bajo el lock (no en la ruta): así el conteo ve
    // las reservas concurrentes ya confirmadas y no se cuelan dos en el límite.
    await assertAppointmentWithinPlanTx(tx, businessId, now);
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        // Con empleado asignado solo chocan sus propias citas (o las de sala,
        // sin empleado); sin equipo choca cualquiera.
        ...(assignedStaffId
          ? { OR: [{ staffId: assignedStaffId }, { staffId: null }] }
          : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new DomainError(
        "Otro cliente acaba de reservar este hueco",
        "SLOT_TAKEN",
        409,
      );
    }

    let priceCents = ctx.service.priceCents;
    let discountCents = 0;
    let couponId: string | null = null;
    let usedPackageId: string | null = null;

    if (clientPackageId) {
      const pkg = await tx.clientPackage.findFirst({
        where: { id: clientPackageId, clientId, businessId },
        include: { package: { select: { serviceId: true } } },
      });
      const rejection = packageRejection(
        pkg
          ? {
              remainingSessions: pkg.remainingSessions,
              expiresAt: pkg.expiresAt,
              packageServiceId: pkg.package.serviceId,
            }
          : null,
        serviceId,
        now,
      );
      if (rejection) throw new DomainError(rejection, "PACKAGE_INVALID", 409);

      await tx.clientPackage.update({
        where: { id: clientPackageId },
        data: { remainingSessions: { decrement: 1 } },
      });
      // La sesión ya está pagada en el bono: la cita queda a 0
      discountCents = priceCents;
      priceCents = 0;
      usedPackageId = clientPackageId;
    } else if (couponCode) {
      const coupon = await tx.coupon.findUnique({
        where: {
          businessId_code: { businessId, code: couponCode.trim().toUpperCase() },
        },
      });
      const rejection = couponRejection(coupon, now);
      if (rejection) throw new DomainError(rejection, "COUPON_INVALID", 409);
      // Cupón personal (premio de fidelidad): solo lo canjea su titular
      if (coupon!.clientId && coupon!.clientId !== clientId) {
        throw new DomainError(
          "Este cupón es personal y pertenece a otro cliente",
          "COUPON_INVALID",
          409,
        );
      }

      discountCents = couponDiscountCents(coupon!, priceCents);
      priceCents -= discountCents;
      couponId = coupon!.id;
      await tx.coupon.update({
        where: { id: coupon!.id },
        data: { timesRedeemed: { increment: 1 } },
      });
    }

    // Membresía: tras bono y cupón (no se acumulan; esas promos ganan) y
    // antes de última hora. El tope mensual se cuenta bajo el advisory lock.
    let membershipId: string | null = null;
    if (!usedPackageId && !couponId) {
      const benefit = await activeMembershipBenefitTx(tx, {
        businessId,
        clientId,
        startAt,
        timezone: businessRow.timezone,
        now,
      });
      if (benefit) {
        discountCents = Math.round(
          (priceCents * benefit.discountPercent) / 100,
        );
        priceCents -= discountCents;
        membershipId = benefit.membershipId;
      }
    }

    // Descuento de última hora: si el negocio lo tiene activo y la cita
    // empieza en menos de LAST_MINUTE_WINDOW_HOURS, se aplica automáticamente.
    // No se acumula con cupones, bonos ni membresías (tienen prioridad).
    if (
      !usedPackageId &&
      !couponId &&
      !membershipId &&
      businessRow.lastMinuteDiscountPercent > 0 &&
      startAt.getTime() - now.getTime() <=
        LAST_MINUTE_WINDOW_HOURS * 3_600_000
    ) {
      discountCents = Math.round(
        (priceCents * businessRow.lastMinuteDiscountPercent) / 100,
      );
      priceCents -= discountCents;
    }

    return tx.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        staffId: assignedStaffId,
        startAt,
        endAt,
        status: "CONFIRMED",
        priceCents,
        discountCents,
        couponId,
        clientPackageId: usedPackageId,
        membershipId,
        locationId,
        notes: notes?.trim() || null,
        seriesId: params.seriesId ?? null,
      },
      include: {
        service: true,
        business: true,
        staff: { select: { id: true, name: true, color: true } },
      },
    });
  });

  // Señal al reservar (si el negocio la exige y el cliente tiene tarjeta
  // guardada). El cargo es una llamada externa, así que va FUERA de la
  // transacción; si la tarjeta lo rechaza, la reserva se deshace por completo
  // (cita + promoción) para no dejar una cita confirmada sin su señal.
  let depositCents = 0;
  let depositStatus = "NONE";
  let depositRef: string | null = null;
  const depositDue = Math.round(
    (appointment.priceCents * appointment.business.depositPercent) / 100,
  );
  if (depositDue > 0 && bookedBy !== "business") {
    const deposit = await collectBookingDeposit({
      appointmentId: appointment.id,
      businessId,
      clientId,
      amountCents: depositDue,
      currency: appointment.business.currency,
      description: `Señal · ${appointment.service.name} · ${appointment.business.name}`,
    });
    if (deposit.depositStatus === "FAILED") {
      await prisma.$transaction([
        prisma.appointment.delete({ where: { id: appointment.id } }),
        ...(appointment.couponId
          ? [
              prisma.coupon.update({
                where: { id: appointment.couponId },
                data: { timesRedeemed: { decrement: 1 } },
              }),
            ]
          : []),
        ...(appointment.clientPackageId
          ? [
              prisma.clientPackage.update({
                where: { id: appointment.clientPackageId },
                data: { remainingSessions: { increment: 1 } },
              }),
            ]
          : []),
      ]);
      throw new DomainError(
        "Tu tarjeta rechazó el cobro de la señal; la reserva no se ha creado",
        "DEPOSIT_FAILED",
        402,
      );
    }
    if (deposit.depositStatus !== "NONE") {
      depositCents = depositDue;
      depositStatus = deposit.depositStatus;
      depositRef = deposit.depositRef;
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { depositCents, depositStatus, depositRef },
      });
    }
  }

  // Confirmación inmediata + recordatorio programado (outbox)
  await enqueueBookingNotifications(appointment.id, now, {
    skipConfirmation: params.suppressConfirmation,
  });

  // Google Calendar saliente: refleja la cita como evento (best-effort)
  await enqueueCalendarSync(appointment.id, "UPSERT", now);

  // El cliente ya cubrió lo que esperaba: quita su entrada de lista de espera
  // de ese servicio y día (si la tenía).
  await fulfillWaitlistOnBooking({
    clientId,
    businessId,
    serviceId,
    desiredDate: dateISO,
  });

  return { ...appointment, depositCents, depositStatus, depositRef };
}

export async function cancelAppointment(params: {
  appointmentId: string;
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { appointmentId, actorUserId, actorIsBusinessAdmin } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: true, service: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  const isOwnerOfAppointment = appointment.clientId === actorUserId;
  if (!isOwnerOfAppointment && !actorIsBusinessAdmin) {
    throw new DomainError("No tienes permiso sobre esta cita", "FORBIDDEN", 403);
  }

  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Solo se pueden cancelar citas confirmadas",
      "INVALID_STATUS",
      409,
    );
  }
  if (appointment.startAt.getTime() <= now.getTime()) {
    throw new DomainError(
      "La cita ya ha comenzado; el negocio debe registrarla como completada o no presentada",
      "ALREADY_STARTED",
      409,
    );
  }

  // El negocio puede cancelar sin penalizar al cliente; la política de cargo
  // solo aplica cuando cancela el propio cliente.
  const outcome =
    actorIsBusinessAdmin && !isOwnerOfAppointment
      ? { status: "CANCELLED" as const, chargedCents: 0, late: false }
      : evaluateCancellation(
          appointment.startAt,
          now,
          {
            windowHours: appointment.business.cancellationWindowHours,
            feePercent: appointment.business.lateCancellationFeePercent,
          },
          appointment.priceCents,
        );

  // Señal cobrada al reservar (si la hubo): en cancelación tardía se descuenta
  // del cargo; en plazo (o si cancela el negocio) se reembolsa íntegra.
  const depositTaken =
    appointment.depositStatus === "CHARGED" ||
    appointment.depositStatus === "SIMULATED"
      ? appointment.depositCents
      : 0;

  let collection: { paymentStatus: string; paymentRef: string | null } = {
    paymentStatus: "NONE",
    paymentRef: null,
  };
  let depositStatusAfter = appointment.depositStatus;

  if (outcome.late) {
    const remaining = Math.max(0, outcome.chargedCents - depositTaken);
    if (remaining > 0) {
      // Cobro automático del resto del cargo con la tarjeta guardada
      collection = await collectAppointmentCharge({
        appointmentId,
        businessId: appointment.businessId,
        clientId: appointment.clientId,
        amountCents: remaining,
        currency: appointment.business.currency,
        description: `Cancelación tardía · ${appointment.service.name} · ${appointment.business.name}`,
      });
    } else if (outcome.chargedCents > 0 && depositTaken > 0) {
      // La señal ya cubre el cargo completo: cobrado desde la reserva.
      collection = {
        paymentStatus: appointment.depositStatus,
        paymentRef: appointment.depositRef,
      };
    }
  } else if (depositTaken > 0 && appointment.depositRef) {
    const refund = await refundCollectedPayment(appointment.depositRef);
    if (refund.ok) {
      depositStatusAfter = "REFUNDED";
    } else {
      // El reembolso se gestiona a mano: queda registrado para diagnóstico.
      logError("payments.deposit.refund", new Error("Reembolso de señal fallido"), {
        appointmentId,
      });
    }
  }

  // Cita pagada con bono: si la cancelación es en plazo (o cancela el
  // negocio) se devuelve la sesión; si es tardía, la sesión se pierde —
  // esa es la penalización, no hay cargo adicional (priceCents ya es 0).
  const restorePackageSession =
    !!appointment.clientPackageId && !outcome.late;

  const [updated] = await prisma.$transaction([
    prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: outcome.status,
        chargedCents: outcome.chargedCents,
        cancelledAt: now,
        paymentStatus: collection.paymentStatus,
        paymentRef: collection.paymentRef,
        depositStatus: depositStatusAfter,
      },
      include: { service: true, business: true },
    }),
    ...(restorePackageSession
      ? [
          prisma.clientPackage.update({
            where: { id: appointment.clientPackageId! },
            data: { remainingSessions: { increment: 1 } },
          }),
        ]
      : []),
  ]);

  await enqueueCancellationNotifications(
    appointmentId,
    outcome.chargedCents,
    now,
  );

  // Se ha liberado el hueco: avisar a la lista de espera de ese servicio y día
  // (en la zona del negocio). Mejor esfuerzo, no rompe la cancelación.
  await notifyWaitlistForFreedSlot({
    businessId: appointment.businessId,
    serviceId: appointment.serviceId,
    staffId: appointment.staffId,
    desiredDate: toLocalDateISO(appointment.startAt, appointment.business.timezone),
    now,
  });

  // Cancelación tardía cobrada → factura del cargo (best-effort). La forma
  // de pago del cargo tardío es siempre la tarjeta guardada.
  await syncInvoiceForAppointment(
    {
      id: updated.id,
      status: updated.status,
      chargedCents: updated.chargedCents,
      paymentStatus: updated.paymentStatus,
      paymentMethod: updated.paymentMethod,
    },
    now,
  );

  // Google Calendar saliente: la cita ya no bloquea → borrar el evento
  await enqueueCalendarSync(appointmentId, "DELETE", now);

  return { appointment: updated, outcome, collection };
}

// ---------------------------------------------------------------------------
// Reprogramación
// ---------------------------------------------------------------------------

// Regla pura de quién puede reprogramar y hasta cuándo. Extraída de
// rescheduleAppointment para poder testearla de forma determinista (sin BD).
// Lanza DomainError; si no lanza, la cita es reprogramable por ese actor.
export function assertReschedulable(params: {
  appointment: { status: string; startAt: Date; clientId: string };
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  cancellationWindowHours: number;
  now: Date;
}): void {
  const {
    appointment,
    actorUserId,
    actorIsBusinessAdmin,
    cancellationWindowHours,
    now,
  } = params;

  const isOwnerOfAppointment = appointment.clientId === actorUserId;
  if (!isOwnerOfAppointment && !actorIsBusinessAdmin) {
    throw new DomainError("No tienes permiso sobre esta cita", "FORBIDDEN", 403);
  }

  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Solo se pueden reprogramar citas confirmadas",
      "INVALID_STATUS",
      409,
    );
  }
  if (appointment.startAt.getTime() <= now.getTime()) {
    throw new DomainError(
      "La cita ya ha comenzado; el negocio debe registrarla como completada o no presentada",
      "ALREADY_STARTED",
      409,
    );
  }

  // El negocio puede reprogramar en cualquier momento; el cliente solo dentro
  // de la ventana de cancelación gratuita: fuera de plazo únicamente puede
  // cancelar (con el cargo que corresponda).
  if (!actorIsBusinessAdmin) {
    const deadline = cancellationDeadline(
      appointment.startAt,
      cancellationWindowHours,
    );
    if (now.getTime() > deadline.getTime()) {
      throw new DomainError(
        "El plazo para reprogramar ha pasado; fuera de plazo solo se puede cancelar la cita",
        "RESCHEDULE_WINDOW_PASSED",
        422,
      );
    }
  }
}

// Mantiene el profesional original si sigue disponible en el hueco nuevo;
// si no, reasigna con la misma regla de menor carga que una reserva nueva.
export function pickRescheduleStaffId(
  originalStaffId: string | null,
  slotStaffIds: string[],
  dayLoadByStaff: Map<string, number>,
): string | null {
  if (originalStaffId && slotStaffIds.includes(originalStaffId)) {
    return originalStaffId;
  }
  return chooseStaffId(slotStaffIds, dayLoadByStaff);
}

// Mueve una cita CONFIRMED a un hueco nuevo validado con el mismo motor que
// una reserva (horario, antelaciones, cierres, solapamientos), excluyendo la
// propia cita: su hueco actual queda libre al moverla.
export async function rescheduleAppointment(params: {
  appointmentId: string;
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  newStartAt: Date;
  now?: Date;
  // Aislamiento en profundidad: si se indica, la cita debe pertenecer a este
  // negocio (los callers admin lo pasan para no depender solo del guard).
  expectedBusinessId?: string;
}) {
  const now = params.now ?? new Date();
  const {
    appointmentId,
    actorUserId,
    actorIsBusinessAdmin,
    newStartAt,
    expectedBusinessId,
  } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }
  if (expectedBusinessId && appointment.businessId !== expectedBusinessId) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  assertReschedulable({
    appointment,
    actorUserId,
    actorIsBusinessAdmin,
    cancellationWindowHours: appointment.business.cancellationWindowHours,
    now,
  });

  const dateISO = toLocalDateISO(newStartAt, appointment.business.timezone);
  const ctx = await loadAvailabilityContext({
    businessId: appointment.businessId,
    serviceId: appointment.serviceId,
    dateISO,
    now,
    // Reprogramar conserva la sede original (cambiar de sede = cancelar y
    // volver a reservar); el equipo se filtra a esa sede.
    locationId: appointment.locationId ?? undefined,
    excludeAppointmentId: appointmentId,
  });

  // Solo instantes exactamente ofertados por el motor de huecos (mismas
  // garantías que createAppointment: antelación mínima/máxima, horario, etc.)
  const slot = slotsFromContext(ctx).find(
    (s) => s.start.getTime() === newStartAt.getTime(),
  );
  if (!slot) {
    throw new DomainError(
      "El horario seleccionado ya no está disponible",
      "SLOT_TAKEN",
      409,
    );
  }

  const hasStaff = ctx.staff.length > 0;
  const assignedStaffId = hasStaff
    ? pickRescheduleStaffId(
        appointment.staffId,
        slot.staffIds,
        ctx.dayLoadByStaff,
      )
    : null;
  if (hasStaff && !assignedStaffId) {
    throw new DomainError(
      "No hay profesionales disponibles en ese horario",
      "SLOT_TAKEN",
      409,
    );
  }

  const newEndAt = new Date(
    newStartAt.getTime() + ctx.service.durationMinutes * 60_000,
  );

  // Transacción: re-comprueba el solapamiento justo antes de mover la cita
  // (misma protección anti doble-reserva que createAppointment) y anula los
  // recordatorios pendientes, que apuntan a la hora antigua.
  const updated = await prisma.$transaction(async (tx) => {
    // Mismo bloqueo de serialización que createAppointment. No-op en SQLite.
    await lockBusinessForBooking(tx, appointment.businessId);
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId: appointment.businessId,
        id: { not: appointmentId },
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: newEndAt },
        endAt: { gt: newStartAt },
        ...(assignedStaffId
          ? { OR: [{ staffId: assignedStaffId }, { staffId: null }] }
          : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new DomainError(
        "Otro cliente acaba de reservar este hueco",
        "SLOT_TAKEN",
        409,
      );
    }

    await tx.notification.updateMany({
      where: { appointmentId, status: "PENDING", template: "REMINDER" },
      data: { status: "SKIPPED", lastError: "Cita reprogramada" },
    });

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { startAt: newStartAt, endAt: newEndAt, staffId: assignedStaffId },
      include: {
        service: true,
        business: true,
        staff: { select: { id: true, name: true, color: true } },
      },
    });
  });

  // Nueva confirmación inmediata + recordatorios reprogramados (outbox).
  // No se registra auditoría: src/lib/audit.ts solo cubre eventos de acceso
  // y cancelAppointment tampoco audita (mismo patrón).
  await enqueueBookingNotifications(appointmentId, now);

  // Google Calendar saliente: mueve el evento al nuevo horario
  await enqueueCalendarSync(appointmentId, "UPSERT", now);

  return updated;
}

// Acciones del negocio sobre citas pasadas o en curso.
export async function setAppointmentStatus(params: {
  appointmentId: string;
  businessId: string;
  status: AppointmentStatus;
  // Forma de cobro presencial elegida por el negocio al completar (CASH por
  // defecto). Se ignora en los demás estados.
  paymentMethod?: InPersonPaymentMethod;
  now?: Date;
}) {
  const { appointmentId, businessId, status } = params;
  const now = params.now ?? new Date();

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { business: true, service: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  let chargedCents = appointment.chargedCents;
  switch (status) {
    case "COMPLETED":
      // El servicio prestado se cobra en persona/TPV: solo se registra
      chargedCents = appointment.priceCents;
      break;
    case "NO_SHOW":
    case "CANCELLED_LATE":
      // Mismo cargo que una cancelación tardía
      chargedCents = Math.round(
        (appointment.priceCents *
          appointment.business.lateCancellationFeePercent) /
          100,
      );
      break;
    case "CONFIRMED":
    case "CANCELLED":
      chargedCents = 0;
      break;
  }

  // El no-show intenta cobrarse automáticamente con la tarjeta guardada.
  // La señal cobrada al reservar (si la hubo) se descuenta del cargo.
  const depositTaken =
    appointment.depositStatus === "CHARGED" ||
    appointment.depositStatus === "SIMULATED"
      ? appointment.depositCents
      : 0;
  let collection = {
    paymentStatus: appointment.paymentStatus,
    paymentRef: appointment.paymentRef,
  };
  if (status === "NO_SHOW" && appointment.paymentStatus === "NONE") {
    const remaining = Math.max(0, chargedCents - depositTaken);
    if (remaining > 0) {
      collection = await collectAppointmentCharge({
        appointmentId,
        businessId,
        clientId: appointment.clientId,
        amountCents: remaining,
        currency: appointment.business.currency,
        description: `No presentado · ${appointment.service.name} · ${appointment.business.name}`,
      });
    } else if (chargedCents > 0 && depositTaken > 0) {
      // La señal ya cubre el cargo completo: cobrado desde la reserva.
      collection = {
        paymentStatus: appointment.depositStatus,
        paymentRef: appointment.depositRef,
      };
    }
  }
  if (status === "CONFIRMED") {
    // Revertir a confirmada limpia el resultado de cobro registrado
    collection = { paymentStatus: "NONE", paymentRef: null };
  }

  // Forma de pago registrada según el desenlace:
  //  - COMPLETED  → cobro presencial (efectivo por defecto, o el que indique el negocio)
  //  - NO_SHOW / CANCELLED_LATE → CARD_ONLINE solo si el cargo se cobró con tarjeta
  //  - CONFIRMED / CANCELLED → sin cobro, se limpia
  let paymentMethod: InPersonPaymentMethod | "CARD_ONLINE" | null = null;
  if (status === "COMPLETED") {
    paymentMethod = params.paymentMethod ?? "CASH";
  } else if (status === "NO_SHOW" || status === "CANCELLED_LATE") {
    paymentMethod =
      collection.paymentStatus === "CHARGED" ||
      collection.paymentStatus === "SIMULATED"
        ? "CARD_ONLINE"
        : null;
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      chargedCents,
      paymentStatus: collection.paymentStatus,
      paymentRef: collection.paymentRef,
      paymentMethod,
      cancelledAt:
        status === "CANCELLED" || status === "CANCELLED_LATE"
          ? (appointment.cancelledAt ?? now)
          : null,
    },
    include: {
      service: true,
      client: { select: { id: true, name: true, email: true } },
    },
  });

  // Avisar al cliente de la ausencia y del cargo (antes se cobraba en silencio).
  if (status === "NO_SHOW") {
    await enqueueNoShowNotification(appointmentId, chargedCents, now);
  }

  // Facturación fiscal: emitir (cobro nuevo) o rectificar (reversión) según
  // el desenlace. Best-effort: nunca rompe la operación de la cita.
  await syncInvoiceForAppointment(updated, now);

  // Tarjeta de sellos: sella al completar y revierte el sello si el estado
  // deja de ser COMPLETED. Best-effort e idempotente (loyaltyStampedAt).
  await syncLoyaltyForStatusChange({
    appointmentId,
    businessId,
    clientId: appointment.clientId,
    status,
    now,
  });

  // Google Calendar saliente: si la cita deja de bloquear agenda se borra el
  // evento; si vuelve a bloquear (revertir a confirmada) se recrea.
  await enqueueCalendarSync(
    appointmentId,
    BLOCKING_STATUSES.includes(status) ? "UPSERT" : "DELETE",
    now,
  );

  return updated;
}

// Confirmación de asistencia desde el enlace del recordatorio.
export async function confirmAttendance(token: string, now = new Date()) {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmationToken: token },
    select: { id: true, status: true, startAt: true },
  });
  if (!appointment) {
    throw new DomainError("Enlace no válido", "TOKEN_NOT_FOUND", 404);
  }
  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Esta cita ya no está activa",
      "INVALID_STATUS",
      409,
    );
  }
  if (appointment.startAt.getTime() <= now.getTime()) {
    throw new DomainError("La cita ya ha pasado", "ALREADY_STARTED", 409);
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { attendanceConfirmedAt: now },
    select: { id: true, attendanceConfirmedAt: true },
  });
}
