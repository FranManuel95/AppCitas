import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

// El diccionario i18n (src/lib/i18n/shared.ts) no tiene claves para el 404,
// así que el texto va en español con subtítulo en inglés, sin añadir claves.
export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <CalendarDays className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-8 text-7xl font-bold tracking-tight text-ink">404</p>
      <h1 className="mt-3 text-lg font-semibold text-ink">
        Página no encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        La página que buscas no existe o se ha movido.
        <span className="mt-0.5 block">
          The page you are looking for doesn&apos;t exist or has moved.
        </span>
      </p>
      <Link
        href="/"
        className={buttonClasses({ variant: "primary", className: "mt-8" })}
      >
        Volver al inicio
      </Link>
    </main>
  );
}
