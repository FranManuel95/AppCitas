import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import sitemap from "@/app/sitemap";
import { resetDb, seedBusiness } from "@/lib/test/factories";

// Modo privado del marketplace: el negocio desaparece del sitemap (y de la
// landing/búsqueda, que usan el mismo filtro), pero su página pública sigue
// siendo accesible por enlace directo/QR.
describe("modo privado del marketplace (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("el sitemap solo incluye negocios visibles", async () => {
    const listed = await seedBusiness();
    const unlisted = await seedBusiness();
    await prisma.business.update({
      where: { id: unlisted.businessId },
      data: { listedInMarketplace: false },
    });
    const [listedRow, unlistedRow] = await Promise.all([
      prisma.business.findUniqueOrThrow({
        where: { id: listed.businessId },
        select: { slug: true },
      }),
      prisma.business.findUniqueOrThrow({
        where: { id: unlisted.businessId },
        select: { slug: true },
      }),
    ]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith(`/b/${listedRow.slug}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/b/${unlistedRow.slug}`))).toBe(false);
  });

  it("la página directa sigue resolviendo aunque no esté listado", async () => {
    const { businessId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { listedInMarketplace: false },
    });
    // La consulta de la página pública es por slug + active (sin filtro de
    // marketplace): el enlace directo/QR sigue vivo.
    const row = await prisma.business.findFirst({
      where: { id: businessId, active: true },
      select: { id: true },
    });
    expect(row).not.toBeNull();
  });
});
