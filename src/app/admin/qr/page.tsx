import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Código QR" };

// Código QR de la página pública de reservas: para el mostrador, el
// escaparate, la ficha de Google o las redes. Se genera en el servidor como
// SVG (nítido a cualquier tamaño, imprimible).
export default async function QrPage() {
  const admin = await requireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { name: true, slug: true },
  });

  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = `${baseUrl}/b/${business.slug}`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-3 print:hidden">
        <SectionHeader
          as="h1"
          title="Código QR de reservas"
          description="Imprímelo para el mostrador o el escaparate: tus clientes escanean y reservan sin llamadas."
        />
        <PrintButton label="Imprimir" />
      </div>

      <Card className="flex flex-col items-center gap-4 py-8 text-center print:border-0 print:shadow-none">
        <p className="text-lg font-semibold tracking-tight text-ink">
          {business.name}
        </p>
        <div
          className="rounded-xl bg-white p-4 [&_svg]:h-64 [&_svg]:w-64"
          // SVG generado en el servidor a partir de la URL propia (sin datos externos)
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-sm font-medium text-ink">Escanea y reserva</p>
        <p className="break-all text-xs tabular-nums text-ink-muted">{url}</p>
      </Card>

      <p className="text-xs text-ink-muted print:hidden">
        Consejo: añade este QR también a tu ficha de Google Business, a tus
        tarjetas y a tus redes. Si activas el modo privado en Ajustes, este
        enlace sigue funcionando aunque no aparezcas en el buscador público.
      </p>
    </div>
  );
}
