export const metadata = { title: "Términos de uso" };

// ⚠️ PLANTILLA: sustituir los [CORCHETES] y revisar con asesoría legal.
export default function TermsPage() {
  return (
    <>
      <h1>Términos y condiciones de uso</h1>
      <p>
        Última actualización: [FECHA]. Estos términos regulan el uso de la
        plataforma AppCitas, operada por <strong>[RAZÓN SOCIAL]</strong>.
        Al crear una cuenta aceptas estos términos.
      </p>

      <h2>El servicio</h2>
      <p>
        AppCitas es una plataforma de intermediación que permite a negocios
        publicar sus servicios y a clientes reservar citas. El servicio
        contratado (la cita) se presta por el negocio, no por AppCitas.
      </p>

      <h2>Reservas y política de cancelación</h2>
      <p>
        Cada negocio define su ventana de cancelación gratuita y el cargo por
        cancelación tardía o no presentación, que se muestran de forma visible
        antes de confirmar cada reserva. <strong>Al reservar aceptas dicha
        política</strong>: si cancelas fuera de plazo o no acudes, el negocio
        podrá cobrarte el porcentaje indicado del precio del servicio,
        automáticamente si guardaste una tarjeta o en persona en caso
        contrario.
      </p>

      <h2>Bonos y cupones</h2>
      <p>
        Los bonos de sesiones se rigen por las condiciones (número de
        sesiones, validez) mostradas al comprarlos. Si cancelas en plazo una
        cita pagada con bono, la sesión vuelve a tu saldo; si cancelas tarde o
        no acudes, la sesión se pierde.
      </p>

      <h2>Cuentas y seguridad</h2>
      <p>
        Eres responsable de la confidencialidad de tus credenciales. Nos
        reservamos el derecho de suspender cuentas que incumplan estos
        términos o hagan un uso fraudulento de la plataforma.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        AppCitas no es parte de la relación entre negocio y cliente y no
        responde de la calidad de los servicios prestados por los negocios.
        Nada en estos términos limita derechos que la ley reconozca al
        consumidor.
      </p>

      <h2>Legislación aplicable</h2>
      <p>
        Estos términos se rigen por la legislación española. Para cualquier
        controversia serán competentes los juzgados de [CIUDAD], salvo que la
        normativa de consumidores disponga otro fuero.
      </p>
    </>
  );
}
