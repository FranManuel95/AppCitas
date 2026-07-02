export const metadata = { title: "Política de privacidad" };

// ⚠️ PLANTILLA: sustituir los [CORCHETES] por los datos reales del responsable
// y revisar con asesoría legal antes de lanzar a producción.
export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>
        Última actualización: [FECHA]. Esta política describe cómo{" "}
        <strong>[RAZÓN SOCIAL]</strong>, con NIF [NIF] y domicilio en
        [DIRECCIÓN] (&quot;nosotros&quot;), trata los datos personales de los
        usuarios de AppCitas, en cumplimiento del Reglamento (UE) 2016/679
        (RGPD) y la LOPDGDD.
      </p>

      <h2>Responsable del tratamiento</h2>
      <p>
        [RAZÓN SOCIAL] · [EMAIL DE CONTACTO] · [TELÉFONO]. Los negocios que
        publican sus servicios en la plataforma actúan como responsables de los
        datos de sus propios clientes; AppCitas actúa como encargado del
        tratamiento por cuenta de dichos negocios.
      </p>

      <h2>Datos que tratamos</h2>
      <p>
        Datos de cuenta (nombre, email, teléfono opcional), datos de reservas
        (servicio, fecha, profesional, notas que decidas incluir), datos de
        facturación de los negocios (NIF, dirección), registros de seguridad
        (IP, dispositivo y eventos de acceso) y, si guardas una tarjeta, un
        identificador de cliente de nuestra pasarela de pago (Stripe): los
        datos completos de la tarjeta nunca pasan por nuestros servidores.
      </p>

      <h2>Finalidades y base jurídica</h2>
      <p>
        Gestionar tu cuenta y tus reservas (ejecución de contrato), enviarte
        confirmaciones y recordatorios de tus citas por email, SMS o WhatsApp
        (ejecución de contrato), cobrar los cargos por cancelación tardía que
        aceptas al reservar (ejecución de contrato), y proteger la plataforma
        frente a fraude y accesos no autorizados (interés legítimo).
      </p>

      <h2>Destinatarios</h2>
      <p>
        Proveedores que nos prestan servicios: procesamiento de pagos
        (Stripe), envío de email ([PROVEEDOR SMTP]), SMS (Twilio) y WhatsApp
        ([ULTRAMSG / SERVIDOR PROPIO]), y alojamiento ([HOSTING]). Algunos
        pueden estar fuera del EEE; en tal caso se aplican cláusulas
        contractuales tipo u otras garantías del RGPD.
      </p>

      <h2>Conservación</h2>
      <p>
        Mantenemos tus datos mientras tu cuenta esté activa y, tras su
        supresión, durante los plazos exigidos por obligaciones legales
        (facturación, reclamaciones).
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión,
        oposición, limitación y portabilidad escribiendo a [EMAIL DE
        CONTACTO]. También puedes reclamar ante la Agencia Española de
        Protección de Datos (aepd.es).
      </p>
    </>
  );
}
