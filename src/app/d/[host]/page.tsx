import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BusinessPage from "@/app/b/[slug]/page";

export const dynamic = "force-dynamic";

// Dominio propio del negocio: el proxy reescribe host ajenos a /d/{host} y
// aquí se resuelve el negocio por Business.customDomain, delegando en la
// página pública normal (el componente de servidor es una función).
async function resolveSlug(host: string): Promise<string> {
  const business = await prisma.business.findFirst({
    where: { customDomain: host.toLowerCase(), active: true },
    select: { slug: true },
  });
  if (!business) notFound();
  return business.slug;
}

export default async function CustomDomainPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;
  const slug = await resolveSlug(decodeURIComponent(host));
  return BusinessPage({ params: Promise.resolve({ slug }) });
}
