// Generación de invitaciones iCalendar (RFC 5545) sin dependencias externas.
// El adjunto .ics permite al cliente añadir su cita al calendario con un toque
// desde el email de confirmación o de recordatorio.

export interface AppointmentIcsInput {
  uid: string;
  startAt: Date;
  endAt: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
}

const CRLF = "\r\n";

// Fecha-hora UTC en formato básico iCalendar: AAAAMMDDTHHMMSSZ
function icsUtcDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

// Escapado de valores TEXT (RFC 5545 §3.3.11): \ ; , y saltos de línea
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Plegado de líneas largas (RFC 5545 §3.1, máx. 75 octetos por línea):
// las continuaciones empiezan con CRLF + un espacio.
function foldLine(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) {
    chunks.push(` ${line.slice(i, i + 73)}`);
  }
  return chunks.join(CRLF);
}

// Construye un VCALENDAR/VEVENT completo en UTC. `now` inyectable (DTSTAMP)
// para poder generar salidas deterministas en tests.
export function buildAppointmentIcs(
  input: AppointmentIcsInput,
  now: Date = new Date(),
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AppCitas//Citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${icsUtcDate(now)}`,
    `DTSTART:${icsUtcDate(input.startAt)}`,
    `DTEND:${icsUtcDate(input.endAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${escapeText(input.location)}`);
  }
  if (input.url) {
    lines.push(`URL:${input.url}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// Calendario completo con varios eventos: el feed privado de la agenda del
// negocio al que Google Calendar/Outlook se suscriben por URL.
export function buildAgendaFeedIcs(
  calendarName: string,
  events: AppointmentIcsInput[],
  now: Date = new Date(),
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AppCitas//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Sugerencia de refresco para los clientes que la respetan (Outlook)
    "X-PUBLISHED-TTL:PT30M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${icsUtcDate(now)}`,
      `DTSTART:${icsUtcDate(event.startAt)}`,
      `DTEND:${icsUtcDate(event.endAt)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
