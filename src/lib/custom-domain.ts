// Dominio propio por negocio (Pro): un host ajeno a la app se reescribe
// internamente a /d/{host}/… y esas páginas resuelven el negocio por
// Business.customDomain. Este módulo es puro (lo usa el proxy en edge y se
// testea sin BD).

const DOMAIN_RE =
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Normaliza lo que teclea el negocio ("https://www.midominio.com/" → host). */
export function normalizeCustomDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  value = value.replace(/:\d+$/, "");
  if (!DOMAIN_RE.test(value)) return null;
  return value;
}

/** Hosts propios de la app: nunca se reescriben. */
export function isAppHost(host: string): boolean {
  const clean = host.toLowerCase().replace(/:\d+$/, "");
  if (clean === "localhost" || clean === "127.0.0.1") return true;
  if (clean.endsWith(".vercel.app")) return true;
  const base = process.env.APP_BASE_URL;
  if (base) {
    try {
      const appHost = new URL(base).hostname.toLowerCase();
      if (clean === appHost || clean === `www.${appHost}`) return true;
    } catch {
      // APP_BASE_URL malformada: mejor no reescribir nada
      return true;
    }
  }
  return false;
}

/**
 * Ruta interna a la que reescribir una petición con host propio de un
 * negocio, o null si no procede. Solo se reescribe la RAÍZ del dominio (la
 * portada pasa a ser la página pública del negocio); el resto de rutas
 * (/b/{slug}/reservar, /login, /api/…) funcionan igual que en el dominio de
 * la app, así los enlaces absolutos de la página siguen operativos.
 */
export function customHostRewritePath(
  host: string | null,
  pathname: string,
): string | null {
  if (!host || isAppHost(host)) return null;
  if (pathname !== "/") return null;
  const clean = host.toLowerCase().replace(/:\d+$/, "");
  if (!DOMAIN_RE.test(clean)) return null;
  return `/d/${clean}`;
}
