import path from "node:path";
import Database from "better-sqlite3";
import { expect, type Page } from "@playwright/test";

export const CLIENT = { email: "cliente@demo.com", password: "cliente1234" };
export const ADMIN = { email: "admin@demo.com", password: "admin1234" };
export const STAFF = { email: "ana@demo.com", password: "staff1234" };

/** Inicia sesión vía API; la cookie queda en el contexto del navegador. */
export async function login(
  page: Page,
  user: { email: string; password: string },
) {
  const res = await page.request.post("/api/auth/login", { data: user });
  const detail = res.ok() ? "" : ` → ${res.status()} ${await res.text()}`;
  expect(res.ok(), `login ${user.email}${detail}`).toBeTruthy();
}

/** Acceso de solo lectura a la BD E2E para obtener ids deterministas. */
export function e2eDb() {
  return new Database(path.join(__dirname, "..", "..", "e2e.db"), {
    readonly: true,
  });
}

export function getBusiness(slug: string): { id: string } {
  const db = e2eDb();
  try {
    const row = db
      .prepare(`SELECT id FROM Business WHERE slug = ?`)
      .get(slug) as { id: string } | undefined;
    if (!row) throw new Error(`negocio ${slug} no sembrado`);
    return row;
  } finally {
    db.close();
  }
}

export function getService(
  businessId: string,
  name: string,
): { id: string; durationMinutes: number } {
  const db = e2eDb();
  try {
    const row = db
      .prepare(
        `SELECT id, durationMinutes FROM Service WHERE businessId = ? AND name = ?`,
      )
      .get(businessId, name) as
      | { id: string; durationMinutes: number }
      | undefined;
    if (!row) throw new Error(`servicio ${name} no sembrado`);
    return row;
  } finally {
    db.close();
  }
}

export function getAppointmentStatus(id: string): string {
  const db = e2eDb();
  try {
    const row = db
      .prepare(`SELECT status FROM Appointment WHERE id = ?`)
      .get(id) as { status: string } | undefined;
    return row?.status ?? "MISSING";
  } finally {
    db.close();
  }
}

/** Próximo lunes al menos `minDays` días en el futuro (día laborable seguro). */
export function nextMonday(minDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

export function toDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface Slot {
  startAt: string;
  label: string;
}

/** Huecos libres reales según la API pública de disponibilidad. */
export async function freeSlots(
  page: Page,
  slug: string,
  serviceId: string,
  dateISO: string,
): Promise<Slot[]> {
  const res = await page.request.get(
    `/api/businesses/${slug}/availability?serviceId=${serviceId}&date=${dateISO}`,
  );
  expect(res.ok(), `disponibilidad ${slug} ${dateISO}`).toBeTruthy();
  const json = (await res.json()) as { slots: Slot[] };
  return json.slots;
}
