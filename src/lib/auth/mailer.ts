import {
  emailChannel,
  sendEmail,
} from "@/lib/notifications/channels/email";
import { renderBrandedEmail } from "@/lib/notifications/email-html";

// Emails transaccionales de autenticación. Se envían en el momento (sin
// outbox: el usuario está esperando el enlace). Sin SMTP configurado, el
// enlace se imprime en el log del servidor para poder probar el flujo.
// Cada mensaje viaja en texto plano (fallback) y en HTML con la marca.

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function deliver(
  to: string,
  subject: string,
  body: string,
  html: string,
) {
  if (emailChannel.isConfigured()) {
    const result = await sendEmail({ to, subject, text: body, html });
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
    renderBrandedEmail({
      title: "Verifica tu email",
      intro:
        `Hola ${params.name},\n\n` +
        `Confirma tu dirección de email para completar tu cuenta de AppCitas.`,
      ctaLabel: "Verificar mi email",
      ctaUrl: link,
      footerNote:
        `Si el botón no funciona, copia este enlace en tu navegador:\n${link}\n\n` +
        `El enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`,
    }),
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
    renderBrandedEmail({
      title: "Restablecer contraseña",
      intro:
        `Hola ${params.name},\n\n` +
        `Para elegir una contraseña nueva pulsa el botón.`,
      ctaLabel: "Elegir contraseña nueva",
      ctaUrl: link,
      footerNote:
        `Si el botón no funciona, copia este enlace en tu navegador:\n${link}\n\n` +
        `El enlace caduca en 30 minutos y solo puede usarse una vez. ` +
        `Si no pediste este cambio, ignora este mensaje: tu contraseña sigue siendo la misma.`,
    }),
  );
}

// Reclamo de cuenta sombra: alguien reservó como invitado con este email y
// ahora quiere registrarse. La posesión del email se demuestra con el mismo
// token de un solo uso del flujo de contraseña.
export async function sendClaimAccountEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const link = `${baseUrl()}/restablecer?token=${params.token}`;
  await deliver(
    params.to,
    "Activa tu cuenta · AppCitas",
    `Hola ${params.name},\n\n` +
      `Ya habías reservado con este email como invitado, así que tu cuenta ya existe. ` +
      `Elige una contraseña para activarla y ver todas tus citas:\n` +
      `${link}\n\n` +
      `El enlace caduca en 30 minutos. Si no has sido tú, ignora este mensaje.`,
    renderBrandedEmail({
      title: "Activa tu cuenta",
      intro:
        `Hola ${params.name},\n\n` +
        `Ya habías reservado con este email como invitado: tu cuenta existe y solo le falta una contraseña.`,
      ctaLabel: "Elegir contraseña",
      ctaUrl: link,
      footerNote: `Si el botón no funciona, copia este enlace en tu navegador:\n${link}`,
    }),
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
    renderBrandedEmail({
      title: `Acceso a tu agenda de ${params.businessName}`,
      intro:
        `Hola ${params.name},\n\n` +
        `${params.businessName} te ha dado acceso a tu agenda de citas en AppCitas. ` +
        `Establece tu contraseña para entrar.`,
      ctaLabel: "Establecer contraseña",
      ctaUrl: link,
      footerNote:
        `Si el botón no funciona, copia este enlace en tu navegador:\n${link}\n\n` +
        `Después podrás acceder con tu email desde ${baseUrl()}/login.`,
    }),
  );
}
