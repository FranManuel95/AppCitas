import { legalData } from "@/lib/legal";

export const metadata = { title: "Aviso legal" };

// Datos del titular parametrizados por entorno (ver src/lib/legal.ts). Revisar
// el texto con asesoría legal antes de operar con datos reales.
export default function LegalNoticePage() {
  const legal = legalData();
  return (
    <>
      <h1>Aviso legal</h1>
      <p>
        En cumplimiento de la Ley 34/2002 (LSSI-CE), se informa de que el
        titular de este sitio web es <strong>{legal.companyName}</strong>, con
        NIF {legal.taxId}, domicilio en {legal.address} e inscrita en{" "}
        {legal.registry}.
      </p>
      <h2>Contacto</h2>
      <p>
        Email: {legal.contactEmail} · Teléfono: {legal.contactPhone}
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        Los contenidos y el software de la plataforma pertenecen a su titular
        o a sus licenciantes. No se permite su reproducción sin autorización.
      </p>
      <h2>Cookies</h2>
      <p>
        Este sitio utiliza únicamente cookies técnicas imprescindibles para su
        funcionamiento (sesión de usuario e idioma preferido), por lo que no
        requieren consentimiento previo según las guías de la AEPD.
      </p>
    </>
  );
}
