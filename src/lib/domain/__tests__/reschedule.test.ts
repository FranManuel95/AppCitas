import { describe, expect, it } from "vitest";
import {
  assertReschedulable,
  pickRescheduleStaffId,
} from "../appointments";
import { computeStaffDaySlots } from "../availability";
import { DomainError } from "../errors";
import { wallTimeToUtc } from "../dates";

// El arnés de tests de dominio de este repo es de funciones puras (sin BD),
// así que aquí se cubren las reglas puras extraídas de rescheduleAppointment:
// - assertReschedulable: permisos, estado, cita comenzada y ventana gratuita.
// - pickRescheduleStaffId: conservar el profesional original o reasignar.
// - el chequeo de hueco ocupado, reproducido con el mismo motor de huecos
//   (computeStaffDaySlots) que usa rescheduleAppointment.
// Queda documentado (no testeable sin BD): la re-comprobación anti
// doble-reserva dentro de la transacción (SLOT_TAKEN en carrera), el paso de
// los recordatorios PENDING a SKIPPED y el reencolado vía
// enqueueBookingNotifications; ese flujo completo se ejercita en e2e.

// Cita el 2026-07-10 a las 10:00Z; ventana de cancelación gratuita de 24 h
// → último instante para reprogramar (cliente): 2026-07-09T10:00Z.
const START_AT = new Date("2026-07-10T10:00:00Z");
const WINDOW_HOURS = 24;

const BASE_APPOINTMENT = {
  status: "CONFIRMED",
  startAt: START_AT,
  clientId: "client-1",
};

function capturedError(fn: () => void): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Se esperaba un DomainError y no se lanzó ninguno");
}

describe("assertReschedulable — reglas de reprogramación", () => {
  it("camino feliz: el cliente dueño reprograma dentro de la ventana", () => {
    expect(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "client-1",
        actorIsBusinessAdmin: false,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-08T10:00:00Z"),
      }),
    ).not.toThrow();
  });

  it("cliente fuera de la ventana gratuita → 422 RESCHEDULE_WINDOW_PASSED", () => {
    // Quedan 2 h para la cita; el plazo (24 h antes) pasó hace tiempo
    const error = capturedError(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "client-1",
        actorIsBusinessAdmin: false,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-10T08:00:00Z"),
      }),
    );
    expect(error.code).toBe("RESCHEDULE_WINDOW_PASSED");
    expect(error.httpStatus).toBe(422);
  });

  it("el instante exacto del plazo aún permite reprogramar (mismo borde que cancelar)", () => {
    expect(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "client-1",
        actorIsBusinessAdmin: false,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-09T10:00:00Z"),
      }),
    ).not.toThrow();
  });

  it("el admin del negocio puede reprogramar fuera de la ventana", () => {
    expect(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "owner-1",
        actorIsBusinessAdmin: true,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-10T08:00:00Z"),
      }),
    ).not.toThrow();
  });

  it("cita ya comenzada → 409 ALREADY_STARTED incluso para el admin", () => {
    const error = capturedError(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "owner-1",
        actorIsBusinessAdmin: true,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-10T10:00:00Z"),
      }),
    );
    expect(error.code).toBe("ALREADY_STARTED");
    expect(error.httpStatus).toBe(409);
  });

  it("solo citas CONFIRMED se pueden reprogramar → 409 INVALID_STATUS", () => {
    const error = capturedError(() =>
      assertReschedulable({
        appointment: { ...BASE_APPOINTMENT, status: "CANCELLED" },
        actorUserId: "client-1",
        actorIsBusinessAdmin: false,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-08T10:00:00Z"),
      }),
    );
    expect(error.code).toBe("INVALID_STATUS");
    expect(error.httpStatus).toBe(409);
  });

  it("un actor que no es dueño ni admin → 403 FORBIDDEN", () => {
    const error = capturedError(() =>
      assertReschedulable({
        appointment: BASE_APPOINTMENT,
        actorUserId: "otro-cliente",
        actorIsBusinessAdmin: false,
        cancellationWindowHours: WINDOW_HOURS,
        now: new Date("2026-07-08T10:00:00Z"),
      }),
    );
    expect(error.code).toBe("FORBIDDEN");
    expect(error.httpStatus).toBe(403);
  });
});

describe("pickRescheduleStaffId — asignación de profesional al mover", () => {
  const load = new Map<string, number>([
    ["staff-a", 3],
    ["staff-b", 0],
  ]);

  it("conserva el profesional original si sigue libre, aunque tenga más carga", () => {
    expect(pickRescheduleStaffId("staff-a", ["staff-a", "staff-b"], load)).toBe(
      "staff-a",
    );
  });

  it("si el original no está libre, reasigna al de menor carga", () => {
    expect(pickRescheduleStaffId("staff-a", ["staff-b"], load)).toBe("staff-b");
  });

  it("cita sin profesional asignado: elige el de menor carga del hueco", () => {
    expect(pickRescheduleStaffId(null, ["staff-a", "staff-b"], load)).toBe(
      "staff-b",
    );
  });

  it("sin candidatos en el hueco devuelve null (→ SLOT_TAKEN en el dominio)", () => {
    expect(pickRescheduleStaffId("staff-a", [], load)).toBeNull();
  });
});

describe("hueco ocupado — mismo chequeo de motor que rescheduleAppointment", () => {
  // 2026-07-08 es miércoles (weekday 3). En julio, Europe/Madrid = UTC+2.
  const TZ = "Europe/Madrid";
  const DATE_ISO = "2026-07-08";
  const businessHours = [
    { weekday: 3, openTime: "09:00", closeTime: "13:00" },
  ];
  const base = {
    dateISO: DATE_ISO,
    timezone: TZ,
    closedDates: [],
    durationMinutes: 60,
    granularityMinutes: 30,
    minNoticeMinutes: 60,
    maxAdvanceBookingDays: 60,
    now: new Date("2026-07-01T08:00:00Z"),
  };

  it("un instante ocupado por otro cliente no se oferta (el dominio lanza SLOT_TAKEN 409)", () => {
    const target = wallTimeToUtc(DATE_ISO, "10:00", TZ);
    const slots = computeStaffDaySlots(base, businessHours, [
      {
        id: "staff-a",
        hours: [],
        busy: [
          {
            startAt: wallTimeToUtc(DATE_ISO, "10:00", TZ),
            endAt: wallTimeToUtc(DATE_ISO, "11:00", TZ),
          },
        ],
      },
    ]);

    // rescheduleAppointment busca el hueco exacto y, si no existe, lanza
    // DomainError("…", "SLOT_TAKEN", 409); aquí verificamos la condición.
    const slot = slots.find((s) => s.start.getTime() === target.getTime());
    expect(slot).toBeUndefined();
  });

  it("el mismo instante libre sí se oferta con el profesional como candidato", () => {
    const target = wallTimeToUtc(DATE_ISO, "10:00", TZ);
    const slots = computeStaffDaySlots(base, businessHours, [
      { id: "staff-a", hours: [], busy: [] },
    ]);

    const slot = slots.find((s) => s.start.getTime() === target.getTime());
    expect(slot).toBeDefined();
    expect(slot!.staffIds).toEqual(["staff-a"]);
  });
});
