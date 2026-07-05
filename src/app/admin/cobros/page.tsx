import { Banknote, Info } from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getConnectSummary, isConnectConfigured } from "@/lib/billing/connect";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ConnectActions } from "@/components/admin/connect-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cobros" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  none: { label: "Sin conectar", tone: "neutral" },
  pending: { label: "Verificación pendiente", tone: "warning" },
  active: { label: "Activa", tone: "success" },
};

export default async function CobrosPage() {
  const admin = await requireBusinessAdmin();
  const summary = await getConnectSummary(admin.businessId);
  const status = STATUS[summary.status] ?? STATUS.none;
  const simulated = !isConnectConfigured();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeader
        as="h1"
        title="Cobros"
        description="Recibe en tu propia cuenta bancaria los cobros de no-shows y cancelaciones tardías de tus clientes."
      />

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <Banknote className="h-5 w-5 text-brand-600" aria-hidden />
            <span className="font-medium text-ink">Cuenta de cobros</span>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        {summary.chargesEnabled ? (
          <p className="text-sm text-ink-soft">
            Tu cuenta está verificada y activa. Cuando cobres un no-show o una
            cancelación tardía, el dinero se ingresa directamente en tu cuenta
            bancaria (la plataforma solo retiene su comisión, si la hay).
          </p>
        ) : summary.connected ? (
          <p className="text-sm text-ink-soft">
            Has empezado a conectar tu cuenta pero falta completar la
            verificación con Stripe. Hasta terminarla, los cobros con tarjeta
            quedan pendientes de gestionar en persona.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            Conecta tu cuenta para cobrar automáticamente con la tarjeta que tus
            clientes guardan al reservar. Sin conectar, esos cobros no se pueden
            hacer online y los gestionas en persona.
          </p>
        )}

        <ConnectActions
          connected={summary.connected}
          chargesEnabled={summary.chargesEnabled}
        />

        {simulated && (
          <div className="flex items-start gap-2.5 rounded-lg bg-surface-3 px-3.5 py-2.5 text-xs text-ink-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              Modo de pruebas: sin claves de Stripe configuradas, la conexión se
              simula (se marca activa sin salir de la app) para poder probar el
              flujo. En producción se abre el registro real de Stripe.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
