import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// SEO: sitemap con las páginas estáticas públicas y la página pública de
// cada negocio activo. Las áreas privadas quedan fuera (ver robots.ts).
// ISR: sin revalidate el sitemap se prerenderizaba UNA vez en el build y los
// negocios dados de alta después no aparecían nunca. Con una hora de
// revalidación se mantiene fresco sin costar una consulta por hit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  // El sitemap se prerenderiza en el build (ISR), así que consulta la BD en
  // ese momento. Si la base no está disponible durante el despliegue (aún sin
  // migrar, red caída, credenciales), NO debe tumbar el build: se cae con
  // gracia a solo las páginas estáticas y el ISR lo completa en el primer hit
  // con la BD ya lista.
  let businesses: Array<{ slug: string; updatedAt: Date }> = [];
  try {
    businesses = await prisma.business.findMany({
      // Solo los negocios visibles en el marketplace (modo privado fuera de SEO)
      where: { active: true, listedInMarketplace: true },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    });
  } catch (error) {
    console.error(
      "[sitemap] no se pudo leer la BD; se emite solo el sitemap estático:",
      error,
    );
  }

  const staticEntries: MetadataRoute.Sitemap = [
    "",
    "/login",
    "/register",
    "/register-business",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.5,
  }));

  const businessEntries: MetadataRoute.Sitemap = businesses.map((b) => ({
    url: `${baseUrl}/b/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...businessEntries];
}
