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
  const [{ slug }, { servicio }, sessionUser] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
  ]);

  const [business, user] = await Promise.all([
    prisma.business.findFirst({
      where: { slug, active: true },
      include: {
        services: { where: { active: true }, orderBy: { priceCents: "asc" } },
        staff: {
          where: { active: true },
          include: { services: { select: { serviceId: true } } },
          orderBy: { name: "asc" },
        },
      },
    }),
    sessionUser
      ? prisma.user.findUnique({
          where: { id: sessionUser.id },
          select: { phone: true },
        })
      : null,
  ]);
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
              requireCardToBook: business.requireCardToBook,
            }}
            services={business.services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              durationMinutes: s.durationMinutes,
              priceCents: s.priceCents,
            }))}
            staff={business.staff.map((m) => ({
              id: m.id,
              name: m.name,
              color: m.color,
              serviceIds: m.services.map((x) => x.serviceId),
            }))}
            initialServiceId={servicio}
            isLoggedIn={!!sessionUser}
            userHasPhone={!!user?.phone}
          />
        </div>
      </main>
    </>
  );
}
