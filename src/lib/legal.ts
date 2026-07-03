// Datos del titular de la plataforma para las páginas legales (aviso legal,
// privacidad, términos). Se parametrizan por variables de entorno para poder
// rellenarlos sin tocar código al desplegar. Los campos sin valor muestran
// "[pendiente]" de forma visible, para que no pase inadvertido que faltan.
//
// El texto legal es una PLANTILLA base: debe revisarse con asesoría jurídica
// antes de operar con datos reales. Estas variables solo rellenan los huecos.

const PENDING = "[pendiente]";

function value(name: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : PENDING;
}

/** Valor opcional: si no está definido, devuelve `fallback` (no "[pendiente]"). */
function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

export interface LegalData {
  companyName: string;
  taxId: string;
  address: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  registry: string;
  lastUpdated: string;
  smtpProvider: string;
  whatsappProvider: string;
  hosting: string;
}

export function legalData(): LegalData {
  return {
    companyName: value("LEGAL_COMPANY_NAME"),
    taxId: value("LEGAL_TAX_ID"),
    address: value("LEGAL_ADDRESS"),
    city: value("LEGAL_CITY"),
    contactEmail: value("LEGAL_CONTACT_EMAIL"),
    contactPhone: value("LEGAL_CONTACT_PHONE"),
    // El registro mercantil solo aplica a sociedades; por defecto se omite.
    registry: optional("LEGAL_REGISTRY", "—"),
    lastUpdated: value("LEGAL_LAST_UPDATED"),
    // Nombres de proveedores para la cláusula de destinatarios (privacidad).
    smtpProvider: optional("LEGAL_SMTP_PROVIDER", "el proveedor de email"),
    whatsappProvider: optional(
      "LEGAL_WHATSAPP_PROVIDER",
      "el proveedor de WhatsApp",
    ),
    hosting: optional("LEGAL_HOSTING", "el proveedor de alojamiento"),
  };
}
