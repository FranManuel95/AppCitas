// Emails HTML con la marca AppCitas. Todos los estilos van en línea y no hay
// imágenes remotas ni CSS externo: es lo único que los clientes de correo
// renderizan de forma consistente (y evita bloqueos por CSP/privacidad).

export interface BrandedEmailRow {
  label: string;
  value: string;
}

export interface BrandedEmailInput {
  title: string;
  intro?: string;
  rows?: BrandedEmailRow[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

const FONT_STACK =
  "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const BRAND_COLOR = "#5b3fd6";
const TEXT_COLOR = "#16161d";
const MUTED_COLOR = "#6e6e7a";
const PAGE_BG = "#f7f7fb";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Texto plano → HTML: escapa, hace clicables las URLs y respeta los saltos
// de línea del cuerpo original.
function textToHtml(value: string): string {
  const escaped = escapeHtml(value);
  const linked = escaped.replace(
    /https?:\/\/[^\s<]*[^\s<.,;:!?)]/g,
    (url) =>
      `<a href="${url}" style="color: ${BRAND_COLOR}; word-break: break-all;">${url}</a>`,
  );
  return linked.replace(/\r\n|\r|\n/g, "<br />");
}

export function renderBrandedEmail(input: BrandedEmailInput): string {
  const sections: string[] = [
    `<h1 style="margin: 0 0 16px; font-size: 20px; line-height: 1.4; font-weight: 700; color: ${TEXT_COLOR};">${escapeHtml(input.title)}</h1>`,
  ];

  if (input.intro) {
    sections.push(
      `<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: ${TEXT_COLOR};">${textToHtml(input.intro)}</p>`,
    );
  }

  if (input.rows && input.rows.length > 0) {
    const rowsHtml = input.rows
      .map(
        (row) =>
          `<tr>` +
          `<td style="padding: 6px 16px 6px 0; font-size: 14px; line-height: 1.5; color: ${MUTED_COLOR}; vertical-align: top; white-space: nowrap;">${escapeHtml(row.label)}</td>` +
          `<td style="padding: 6px 0; font-size: 14px; line-height: 1.5; color: ${TEXT_COLOR};">${escapeHtml(row.value)}</td>` +
          `</tr>`,
      )
      .join("");
    sections.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; border-collapse: collapse;">${rowsHtml}</table>`,
    );
  }

  if (input.ctaLabel && input.ctaUrl) {
    sections.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 4px 0 20px;"><tr>` +
        `<td style="border-radius: 8px; background-color: ${BRAND_COLOR};">` +
        `<a href="${escapeHtml(input.ctaUrl)}" style="display: inline-block; padding: 12px 28px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">${escapeHtml(input.ctaLabel)}</a>` +
        `</td></tr></table>`,
    );
  }

  if (input.footerNote) {
    sections.push(
      `<p style="margin: 20px 0 0; font-size: 13px; line-height: 1.5; color: ${MUTED_COLOR};">${textToHtml(input.footerNote)}</p>`,
    );
  }

  return (
    `<!DOCTYPE html>` +
    `<html lang="es">` +
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(input.title)}</title></head>` +
    `<body style="margin: 0; padding: 0; background-color: ${PAGE_BG};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${PAGE_BG};"><tr><td align="center" style="padding: 24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 100%;">` +
    `<tr><td style="padding: 8px 4px 16px; font-family: ${FONT_STACK}; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: ${BRAND_COLOR};">AppCitas</td></tr>` +
    `<tr><td style="background-color: #ffffff; border-radius: 12px; padding: 32px 28px; font-family: ${FONT_STACK};">${sections.join("")}</td></tr>` +
    `<tr><td style="padding: 16px 4px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 1.5; color: ${MUTED_COLOR};">Enviado por AppCitas</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`
  );
}
