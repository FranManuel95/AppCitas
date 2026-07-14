import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { brandStyle } from "@/lib/branding";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { BookingWizard } from "@/components/booking-wizard";
import { getBookableLocations } from "@/lib/domain/locations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservar cita" };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servicio?: string }>;
}) {
  const [{ slug }, { servicio }, sessionUser, { locale, t }] =
    await Promise.all([params, searchParams, getSessionUser(), getDict()]);

  const [business, user] = await Promise.all([
    prisma.business.findFirst({
      where: { slug, active: true },
      include: {
        services: { where: { active: true }, orderBy: { priceCents: "asc" } },
        staff: {
          where: { active: true },
          include: {
            services: {
              select: {
                serviceId: true,
                durationMinutes: true,
                priceCents: true,
              },
            },
          },
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

  // Selector de sede: solo con >1 sede activa y equipo activo
  const locations = await getBookableLocations(business.id);

  return (
    <>
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10"
        style={brandStyle(business.brandColor)}
      >
        <p className="text-sm text-ink-muted">
          <Link
            href={`/b/${business.slug}`}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {business.name}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          {t.booking.title}
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
              depositPercent: business.depositPercent,
              lastMinuteDiscountPercent: business.lastMinuteDiscountPercent,
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
              overrides: m.services
                .filter(
                  (x) => x.durationMinutes != null || x.priceCents != null,
                )
                .map((x) => ({
                  serviceId: x.serviceId,
                  durationMinutes: x.durationMinutes,
                  priceCents: x.priceCents,
                })),
              locationId: m.locationId,
            }))}
            locations={locations}
            initialServiceId={servicio}
            isLoggedIn={!!sessionUser}
            userHasPhone={!!user?.phone}
            locale={locale}
            t={t.booking}
          />
        </div>
      </main>
    </>
  );
}
