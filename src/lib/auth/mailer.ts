import { emailChannel } from "@/lib/notifications/channels/email";

// Emails transaccionales de autenticación. Se envían en el momento (sin
// outbox: el usuario está esperando el enlace). Sin SMTP configurado, el
// enlace se imprime en el log del servidor para poder probar el flujo.

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function deliver(to: string, subject: string, body: string) {
  if (emailChannel.isConfigured()) {
    const result = await emailChannel.send(to, subject, body);
    if (!result.ok) {
      console.error(`[auth-mail] fallo enviando a ${to}: ${result.error}`);
    }
    return;
  }
  console.log(`[auth-mail:dev] ${subject} → ${to}\n${body}\n---`);
}

export async function sendVerificationEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const link = `${baseUrl()}/verificar-email?token=${params.token}`;
  await deliver(
    params.to,
    "Verifica tu email · AppCitas",
    `Hola ${params.name},\n\n` +
      `Confirma tu dirección de email para completar tu cuenta de AppCitas:\n` +
      `${link}\n\n` +
      `El enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`,
  );
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const link = `${baseUrl()}/restablecer?token=${params.token}`;
  await deliver(
    params.to,
    "Restablecer contraseña · AppCitas",
    `Hola ${params.name},\n\n` +
      `Para elegir una contraseña nueva entra aquí:\n` +
      `${link}\n\n` +
      `El enlace caduca en 30 minutos y solo puede usarse una vez. ` +
      `Si no pediste este cambio, ignora este mensaje: tu contraseña sigue siendo la misma.`,
  );
}

export async function sendStaffInviteEmail(params: {
  to: string;
  name: string;
  businessName: string;
  token: string;
}) {
  const link = `${baseUrl()}/restablecer?token=${params.token}`;
  await deliver(
    params.to,
    `Acceso a tu agenda de ${params.businessName} · AppCitas`,
    `Hola ${params.name},\n\n` +
      `${params.businessName} te ha dado acceso a tu agenda de citas en AppCitas.\n` +
      `Establece tu contraseña para entrar:\n` +
      `${link}\n\n` +
      `Después podrás acceder con tu email desde ${baseUrl()}/login.`,
  );
}
