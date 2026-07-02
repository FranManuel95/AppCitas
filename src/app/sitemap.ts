import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// SEO: sitemap con las páginas estáticas públicas y la página pública de
// cada negocio activo. Las áreas privadas quedan fuera (ver robots.ts).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  const businesses = await prisma.business.findMany({
    where: { active: true },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });

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
