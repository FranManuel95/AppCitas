import { prisma } from "@/lib/prisma";
import { findOrCreateGuestClient } from "./guest-clients";

// Importador CSV para traerse la cartera desde otra plataforma (Booksy,
// Excel del mostrador…). Tolerante con lo que exportan esas herramientas:
// separador , o ; cabeceras en español o inglés, y celdas entrecomilladas.
//
// Los clientes importados aún no tienen citas: su "pertenencia" al negocio
// se materializa con una ClientNote de importación (la cartera del CRM y las
// campañas incluyen a los clientes con notas, no solo con citas).

export const IMPORT_NOTE_TEXT = "Importado desde CSV";
const MAX_ROWS = 2000;

export interface ClientRow {
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string; // YYYY-MM-DD
}

export interface ServiceRow {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ line: number; reason: string }>;
}

/** Divide una línea CSV respetando comillas dobles. */
function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function detectSeparator(headerLine: string): string {
  return headerLine.split(";").length > headerLine.split(",").length
    ? ";"
    : ",";
}

/** Índices de columna por sinónimos de cabecera (es/en, con o sin tildes). */
function headerIndex(
  headers: string[],
  synonyms: string[],
): number {
  const normalized = headers.map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  );
  return normalized.findIndex((h) => synonyms.some((s) => h.includes(s)));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ES_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function normalizeDate(raw: string): string | null {
  if (DATE_RE.test(raw)) return raw;
  const es = DATE_ES_RE.exec(raw); // 31/12/1990 → 1990-12-31
  if (es) {
    return `${es[3]}-${es[2].padStart(2, "0")}-${es[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseClientsCsv(text: string): ParseResult<ClientRow> {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 1, reason: "CSV vacío o sin datos" }] };
  }
  const sep = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], sep);
  const nameIdx = headerIndex(headers, ["nombre", "name", "cliente", "client"]);
  const emailIdx = headerIndex(headers, ["email", "correo", "e-mail", "mail"]);
  const phoneIdx = headerIndex(headers, ["telefono", "phone", "movil", "mobile", "tel"]);
  const birthIdx = headerIndex(headers, ["nacimiento", "birth", "cumple"]);

  if (nameIdx === -1) {
    return {
      rows: [],
      errors: [
        { line: 1, reason: 'Falta la columna "nombre" (o "name") en la cabecera' },
      ],
    };
  }

  const rows: ClientRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  for (let i = 1; i < lines.length && rows.length < MAX_ROWS; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const name = cells[nameIdx]?.trim() ?? "";
    if (name.length < 2) {
      errors.push({ line: i + 1, reason: "Nombre vacío o demasiado corto" });
      continue;
    }
    const rawEmail = emailIdx >= 0 ? (cells[emailIdx]?.trim() ?? "") : "";
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      errors.push({ line: i + 1, reason: `Email no válido: ${rawEmail}` });
      continue;
    }
    const rawBirth = birthIdx >= 0 ? (cells[birthIdx]?.trim() ?? "") : "";
    const birthDate = rawBirth ? normalizeDate(rawBirth) : undefined;
    if (rawBirth && !birthDate) {
      errors.push({
        line: i + 1,
        reason: `Fecha de nacimiento no válida: ${rawBirth} (usa AAAA-MM-DD o DD/MM/AAAA)`,
      });
      continue;
    }
    rows.push({
      name: name.slice(0, 100),
      email: rawEmail.toLowerCase() || undefined,
      phone: (phoneIdx >= 0 ? cells[phoneIdx]?.trim() : "") || undefined,
      birthDate: birthDate ?? undefined,
    });
  }
  if (lines.length - 1 > MAX_ROWS) {
    errors.push({
      line: MAX_ROWS + 2,
      reason: `Se importan como máximo ${MAX_ROWS} filas por tanda; divide el archivo`,
    });
  }
  return { rows, errors };
}

export async function importClients(
  businessId: string,
  rows: ClientRow[],
): Promise<{ created: number; reused: number }> {
  let created = 0;
  let reused = 0;
  for (const row of rows) {
    const result = await findOrCreateGuestClient({
      name: row.name,
      email: row.email,
      phone: row.phone,
      // El negocio importa SU cartera: puede referenciar cuentas ya existentes
      allowClaimedAccounts: true,
    });
    if (result.created) created++;
    else reused++;

    // Cumpleaños: solo si el usuario no lo tenía (no pisar lo que él aportó)
    if (row.birthDate) {
      await prisma.user.updateMany({
        where: { id: result.clientId, birthDate: null },
        data: { birthDate: new Date(`${row.birthDate}T00:00:00.000Z`) },
      });
    }

    // Pertenencia a la cartera sin citas: nota de importación (una sola por
    // cliente y negocio, no se duplica al re-importar)
    const existingNote = await prisma.clientNote.findFirst({
      where: { businessId, clientId: result.clientId, text: IMPORT_NOTE_TEXT },
      select: { id: true },
    });
    if (!existingNote) {
      await prisma.clientNote.create({
        data: {
          businessId,
          clientId: result.clientId,
          text: IMPORT_NOTE_TEXT,
          authorName: null,
        },
      });
    }
  }
  return { created, reused };
}

export function parseServicesCsv(text: string): ParseResult<ServiceRow> {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 1, reason: "CSV vacío o sin datos" }] };
  }
  const sep = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], sep);
  const nameIdx = headerIndex(headers, ["nombre", "name", "servicio", "service"]);
  const durationIdx = headerIndex(headers, ["duracion", "duration", "min"]);
  const priceIdx = headerIndex(headers, ["precio", "price", "importe"]);

  if (nameIdx === -1 || durationIdx === -1 || priceIdx === -1) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          reason:
            'La cabecera necesita las columnas "nombre", "duracion" (min) y "precio" (€)',
        },
      ],
    };
  }

  const rows: ServiceRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  for (let i = 1; i < lines.length && rows.length < MAX_ROWS; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const name = cells[nameIdx]?.trim() ?? "";
    const durationMinutes = Number(cells[durationIdx]);
    // Precio en euros con coma o punto decimal → céntimos
    const priceCents = Math.round(
      Number((cells[priceIdx] ?? "").replace(",", ".").replace("€", "").trim()) * 100,
    );
    if (name.length < 2) {
      errors.push({ line: i + 1, reason: "Nombre vacío o demasiado corto" });
      continue;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      errors.push({ line: i + 1, reason: `Duración no válida: ${cells[durationIdx]}` });
      continue;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 1_000_000) {
      errors.push({ line: i + 1, reason: `Precio no válido: ${cells[priceIdx]}` });
      continue;
    }
    rows.push({ name: name.slice(0, 100), durationMinutes, priceCents });
  }
  return { rows, errors };
}

export async function importServices(
  businessId: string,
  rows: ServiceRow[],
): Promise<{ created: number; skippedExisting: number }> {
  const existing = await prisma.service.findMany({
    where: { businessId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

  let created = 0;
  let skippedExisting = 0;
  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) {
      skippedExisting++;
      continue;
    }
    await prisma.service.create({
      data: {
        businessId,
        name: row.name,
        durationMinutes: row.durationMinutes,
        priceCents: row.priceCents,
        active: true,
      },
    });
    existingNames.add(row.name.toLowerCase());
    created++;
  }
  return { created, skippedExisting };
}
