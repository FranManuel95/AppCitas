import { describe, expect, it } from "vitest";
import {
  chooseStaffId,
  computeStaffDaySlots,
  type SlotEngineInput,
  type StaffAgendaContext,
} from "../availability";
import { toLocalTime, wallTimeToUtc } from "../dates";

// 2026-07-08 es miércoles (weekday 3). Europe/Madrid = UTC+2 en verano.
const TZ = "Europe/Madrid";
const BASE: Omit<SlotEngineInput, "busy" | "hours"> = {
  dateISO: "2026-07-08",
  timezone: TZ,
  closedDates: [],
  durationMinutes: 60,
  granularityMinutes: 60,
  minNoticeMinutes: 60,
  maxAdvanceBookingDays: 60,
  now: new Date("2026-07-01T08:00:00Z"),
};

const BUSINESS_HOURS = [{ weekday: 3, openTime: "09:00", closeTime: "12:00" }];

function labels(slots: Array<{ start: Date }>) {
  return slots.map((s) => toLocalTime(s.start, TZ));
}

describe("computeStaffDaySlots — agenda multi-empleado", () => {
  it("un empleado sin horario propio hereda el del negocio", () => {
    const staff: StaffAgendaContext[] = [{ id: "ana", hours: [], busy: [] }];
    const slots = computeStaffDaySlots(BASE, BUSINESS_HOURS, staff);

    expect(labels(slots)).toEqual(["09:00", "10:00", "11:00"]);
    expect(slots.every((s) => s.staffIds.length === 1)).toBe(true);
  });

  it("el horario propio del empleado prevalece sobre el del negocio", () => {
    const staff: StaffAgendaContext[] = [
      {
        id: "ana",
        hours: [{ weekday: 3, openTime: "10:00", closeTime: "12:00" }],
        busy: [],
      },
    ];
    const slots = computeStaffDaySlots(BASE, BUSINESS_HOURS, staff);

    expect(labels(slots)).toEqual(["10:00", "11:00"]);
  });

  it("la unión de dos empleados oferta más huecos y acumula candidatos", () => {
    const staff: StaffAgendaContext[] = [
      {
        id: "ana",
        hours: [{ weekday: 3, openTime: "09:00", closeTime: "11:00" }],
        busy: [],
      },
      {
        id: "bruno",
        hours: [{ weekday: 3, openTime: "10:00", closeTime: "13:00" }],
        busy: [],
      },
    ];
    const slots = computeStaffDaySlots(BASE, BUSINESS_HOURS, staff);

    expect(labels(slots)).toEqual(["09:00", "10:00", "11:00", "12:00"]);
    const at10 = slots.find(
      (s) => toLocalTime(s.start, TZ) === "10:00",
    );
    expect(at10?.staffIds.sort()).toEqual(["ana", "bruno"]);
    const at9 = slots.find((s) => toLocalTime(s.start, TZ) === "09:00");
    expect(at9?.staffIds).toEqual(["ana"]);
  });

  it("la cita de un empleado no bloquea la agenda del otro", () => {
    const anaBusy = {
      startAt: wallTimeToUtc("2026-07-08", "10:00", TZ),
      endAt: wallTimeToUtc("2026-07-08", "11:00", TZ),
    };
    const staff: StaffAgendaContext[] = [
      { id: "ana", hours: [], busy: [anaBusy] },
      { id: "bruno", hours: [], busy: [] },
    ];
    const slots = computeStaffDaySlots(BASE, BUSINESS_HOURS, staff);

    const at10 = slots.find((s) => toLocalTime(s.start, TZ) === "10:00");
    expect(at10?.staffIds).toEqual(["bruno"]); // Ana ocupada, Bruno libre
  });

  it("si todos están ocupados el hueco desaparece", () => {
    const busy = {
      startAt: wallTimeToUtc("2026-07-08", "10:00", TZ),
      endAt: wallTimeToUtc("2026-07-08", "11:00", TZ),
    };
    const staff: StaffAgendaContext[] = [
      { id: "ana", hours: [], busy: [busy] },
      { id: "bruno", hours: [], busy: [busy] },
    ];
    const slots = computeStaffDaySlots(BASE, BUSINESS_HOURS, staff);

    expect(labels(slots)).toEqual(["09:00", "11:00"]);
  });
});

describe("chooseStaffId — asignación automática", () => {
  it("elige al empleado con menos carga", () => {
    const load = new Map([
      ["ana", 4],
      ["bruno", 1],
    ]);
    expect(chooseStaffId(["ana", "bruno"], load)).toBe("bruno");
  });

  it("sin carga registrada cuenta como 0", () => {
    const load = new Map([["ana", 2]]);
    expect(chooseStaffId(["ana", "bruno"], load)).toBe("bruno");
  });

  it("empate → orden determinista", () => {
    expect(chooseStaffId(["bruno", "ana"], new Map())).toBe("ana");
  });

  it("sin candidatos devuelve null", () => {
    expect(chooseStaffId([], new Map())).toBeNull();
  });
});
