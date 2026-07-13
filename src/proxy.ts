import { NextResponse, type NextRequest } from "next/server";
import { customHostRewritePath } from "@/lib/custom-domain";

// Content-Security-Policy con nonce por request. Next propaga el nonce a sus
// propios <script> cuando lee la CSP de las cabeceras de la PETICIÓN, así que
// los scripts de la app quedan cubiertos sin allowlist de hosts.
//
// Por defecto va en modo REPORT-ONLY: el navegador no bloquea nada, solo
// reporta violaciones a /api/csp-report (que las loguea). Es el paso seguro
// para observar qué rompería antes de forzarla — sobre todo por Stripe.js, que
// se carga en cliente y no se puede ejercitar aquí. Pon CSP_ENFORCE=true para
// pasar a bloquear (validar antes en staging).
//
// style-src incluye 'unsafe-inline' porque la app usa muchos estilos en línea
// (style={{…}}), que no admiten nonce. script-src es estricto (nonce +
// strict-dynamic); js.stripe.com queda como fallback para navegadores sin
// strict-dynamic. frame/connect-src abren lo justo para Stripe Elements.
function buildCsp(nonce: string, embeddable: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    `style-src 'self' 'unsafe-inline'`,
    // https: para el logo del negocio (URL externa configurable en Ajustes)
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.stripe.com`,
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // El widget /widget/{slug} está pensado para incrustarse en la web del
    // negocio; el resto de la app no se puede enmarcar (clickjacking).
    `frame-ancestors ${embeddable ? "*" : "'none'"}`,
    `upgrade-insecure-requests`,
    `report-uri /api/csp-report`,
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const embeddable = request.nextUrl.pathname.startsWith("/widget/");
  const csp = buildCsp(nonce, embeddable);

  // La CSP va en la petición para que Next añada el nonce a sus scripts; el
  // nonce queda accesible por si algún componente inyecta un <script> inline.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Dominio propio del negocio (Pro): un host ajeno a la app se reescribe a
  // /d/{host}/…, que resuelve el negocio por Business.customDomain. El
  // dominio también debe estar añadido en Vercel (DEPLOY.md).
  const rewritePath = customHostRewritePath(
    request.headers.get("host"),
    request.nextUrl.pathname,
  );
  const response = rewritePath
    ? NextResponse.rewrite(new URL(rewritePath, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });

  // Enforce solo si se pide explícitamente; por defecto, report-only.
  const header =
    process.env.CSP_ENFORCE === "true"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";
  response.headers.set(header, csp);

  // Anti-clickjacking: X-Frame-Options se emite aquí (no en next.config) para
  // poder eximir al widget embebible. La CSP report-only no bloquea, así que
  // esta cabecera es la protección efectiva por defecto.
  if (!embeddable) {
    response.headers.set("X-Frame-Options", "DENY");
  }
  return response;
}

export const config = {
  // Todas las rutas salvo estáticos de Next, el favicon y las imágenes: no
  // necesitan CSP y evitan sobrecarga.
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
