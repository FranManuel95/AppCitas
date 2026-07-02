import { describe, expect, it } from "vitest";
import {
  computeDaySlots,
  isOfferedSlot,
  type SlotEngineInput,
} from "../availability";
import { toLocalTime, wallTimeToUtc } from "../dates";

// 2026-07-08 es miércoles (weekday 3). En julio, Europe/Madrid = UTC+2.
const BASE: SlotEngineInput = {
  dateISO: "2026-07-08",
  timezone: "Europe/Madrid",
  hours: [{ weekday: 3, openTime: "09:00", closeTime: "12:00" }],
  closedDates: [],
  busy: [],
  durationMinutes: 60,
  granularityMinutes: 30,
  minNoticeMinutes: 60,
  maxAdvanceBookingDays: 60,
  now: new Date("2026-07-01T08:00:00Z"),
};

describe("computeDaySlots — motor de disponibilidad", () => {
  it("genera huecos dentro del horario según la granularidad", () => {
    const slots = computeDaySlots(BASE);
    const labels = slots.map((s) => toLocalTime(s.start, BASE.timezone));

    // 09:00–12:00 con servicios de 60 min cada 30 min: último inicio 11:00
    expect(labels).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("los huecos son instantes UTC correctos para la zona del negocio", () => {
    const slots = computeDaySlots(BASE);
    // 09:00 en Madrid (UTC+2 en verano) = 07:00Z
    expect(slots[0].start.toISOString()).toBe("2026-07-08T07:00:00.000Z");
  });

  it("excluye huecos que solapan con citas existentes", () => {
    const slots = computeDaySlots({
      ...BASE,
      busy: [
        {
          startAt: wallTimeToUtc("2026-07-08", "10:00", BASE.timezone),
          endAt: wallTimeToUtc("2026-07-08", "11:00", BASE.timezone),
        },
      ],
    });
    const labels = slots.map((s) => toLocalTime(s.start, BASE.timezone));

    // 09:30 solaparía (termina 10:30), 10:00 y 10:30 chocan; quedan 09:00 y 11:00
    expect(labels).toEqual(["09:00", "11:00"]);
  });

  it("día marcado como cerrado no ofrece huecos", () => {
    const slots = computeDaySlots({ ...BASE, closedDates: ["2026-07-08"] });
    expect(slots).toEqual([]);
  });

  it("día sin horario definido no ofrece huecos", () => {
    const slots = computeDaySlots({ ...BASE, dateISO: "2026-07-12" }); // domingo
    expect(slots).toEqual([]);
  });

  it("respeta la antelación mínima", () => {
    // now = 08:30Z del mismo día = 10:30 en Madrid; antelación 60 min → desde 11:30…
    // pero el último inicio válido es 11:00, así que solo quedaría nada ≥ 11:30
    const slots = computeDaySlots({
      ...BASE,
      now: new Date("2026-07-08T08:30:00Z"),
    });
    const labels = slots.map((s) => toLocalTime(s.start, BASE.timezone));
    expect(labels).toEqual([]);
  });

  it("antelación mínima deja pasar los huecos posteriores", () => {
    // now = 06:30Z = 08:30 Madrid; +60 min → huecos desde 09:30
    const slots = computeDaySlots({
      ...BASE,
      now: new Date("2026-07-08T06:30:00Z"),
    });
    const labels = slots.map((s) => toLocalTime(s.start, BASE.timezone));
    expect(labels).toEqual(["09:30", "10:00", "10:30", "11:00"]);
  });

  it("no ofrece huecos más allá del máximo de antelación", () => {
    const slots = computeDaySlots({
      ...BASE,
      maxAdvanceBookingDays: 3, // now es 1 de julio; el día 8 queda fuera
    });
    expect(slots).toEqual([]);
  });

  it("servicio más largo que el tramo no genera huecos", () => {
    const slots = computeDaySlots({ ...BASE, durationMinutes: 240 });
    expect(slots).toEqual([]);
  });

  it("varios tramos el mismo día generan huecos en ambos", () => {
    const slots = computeDaySlots({
      ...BASE,
      hours: [
        { weekday: 3, openTime: "09:00", closeTime: "11:00" },
        { weekday: 3, openTime: "16:00", closeTime: "18:00" },
      ],
      durationMinutes: 60,
      granularityMinutes: 60,
    });
    const labels = slots.map((s) => toLocalTime(s.start, BASE.timezone));
    expect(labels).toEqual(["09:00", "10:00", "16:00", "17:00"]);
  });

  it("duración o granularidad inválidas devuelven vacío", () => {
    expect(computeDaySlots({ ...BASE, durationMinutes: 0 })).toEqual([]);
    expect(computeDaySlots({ ...BASE, granularityMinutes: 0 })).toEqual([]);
  });
});

describe("isOfferedSlot — validación al reservar", () => {
  it("acepta un instante exactamente ofertado", () => {
    const nineAM = wallTimeToUtc("2026-07-08", "09:00", BASE.timezone);
    expect(isOfferedSlot(BASE, nineAM)).toBe(true);
  });

  it("rechaza un instante no alineado a la oferta", () => {
    const misaligned = wallTimeToUtc("2026-07-08", "09:15", BASE.timezone);
    expect(isOfferedSlot(BASE, misaligned)).toBe(false);
  });

  it("rechaza horas fuera del horario", () => {
    const early = wallTimeToUtc("2026-07-08", "08:00", BASE.timezone);
    expect(isOfferedSlot(BASE, early)).toBe(false);
  });
});
