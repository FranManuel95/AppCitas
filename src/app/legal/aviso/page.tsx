export const metadata = { title: "Aviso legal" };

// ⚠️ PLANTILLA: sustituir los [CORCHETES] y revisar con asesoría legal.
export default function LegalNoticePage() {
  return (
    <>
      <h1>Aviso legal</h1>
      <p>
        En cumplimiento de la Ley 34/2002 (LSSI-CE), se informa de que el
        titular de este sitio web es <strong>[RAZÓN SOCIAL]</strong>, con NIF
        [NIF], domicilio en [DIRECCIÓN] e inscrita en [REGISTRO MERCANTIL, si
        procede].
      </p>
      <h2>Contacto</h2>
      <p>Email: [EMAIL DE CONTACTO] · Teléfono: [TELÉFONO]</p>
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
