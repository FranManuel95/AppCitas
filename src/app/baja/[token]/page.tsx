import { BellOff, CalendarDays } from "lucide-react";
import { getDict } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { UnsubscribeButton } from "@/components/unsubscribe-button";

/* Mini-cabecera de marca: esta página pública no lleva el header global. */
function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
        <CalendarDays className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">
        AppCitas
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Baja de comunicaciones" };

// Baja de comunicaciones comerciales. La confirmación es un POST tras un
// click explícito: los escáneres de enlaces del correo (prefetch) no deben
// dar de baja a nadie por abrir el email.
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, { t }] = await Promise.all([params, getDict()]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark />
        <Card className="mt-6 p-6 text-center sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-3">
            <BellOff className="h-5 w-5 text-ink-muted" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
            {t.unsubscribe.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {t.unsubscribe.description}
          </p>
          <UnsubscribeButton token={token} labels={t.unsubscribe} />
        </Card>
      </div>
    </main>
  );
}
