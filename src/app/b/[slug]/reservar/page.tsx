import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site-header";
import { BookingWizard } from "@/components/booking-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservar cita" };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servicio?: string }>;
}) {
  const [{ slug }, { servicio }, user] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
  ]);

  const business = await prisma.business.findFirst({
    where: { slug, active: true },
    include: {
      services: { where: { active: true }, orderBy: { priceCents: "asc" } },
    },
  });
  if (!business) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <p className="text-sm text-slate-500">
          <Link href={`/b/${business.slug}`} className="hover:text-slate-800">
            ← {business.name}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Reservar cita
        </h1>
        <div className="mt-6">
          <BookingWizard
            business={{
              id: business.id,
              slug: business.slug,
              name: business.name,
              timezone: business.timezone,
              currency: business.currency,
              cancellationWindowHours: business.cancellationWindowHours,
              lateCancellationFeePercent: business.lateCancellationFeePercent,
              maxAdvanceBookingDays: business.maxAdvanceBookingDays,
            }}
            services={business.services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              durationMinutes: s.durationMinutes,
              priceCents: s.priceCents,
            }))}
            initialServiceId={servicio}
            isLoggedIn={!!user}
          />
        </div>
      </main>
    </>
  );
}
