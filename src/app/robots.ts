import type { MetadataRoute } from "next";

// SEO: reglas de rastreo. Se bloquean las áreas privadas (paneles, API,
// citas del cliente) y las páginas de confirmación por token (/c/...).
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/personal", "/api", "/mis-citas", "/c/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
