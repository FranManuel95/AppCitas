import {
  MessageCircle,
  PiggyBank,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getPlatformEconomics } from "@/lib/domain/platform";
import { formatCents } from "@/lib/money";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EconomySettingsForm } from "@/components/superadmin/economy-settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Economía" };

// Rentabilidad de la plataforma calculada sola: el sistema ya sabe cuántos
// negocios pagan y qué mensajes se han enviado; los costes los edita el
// super-admin aquí mismo.
export default async function EconomiaPage() {
  await requireSuperAdmin();
  const eco = await getPlatformEconomics();

  const profitTone = eco.profitCents >= 0 ? "success" : "danger";

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Economía"
        description={`Ingresos reales de ${eco.proActive} suscripción(es) Pro activas y costes estimados del mes en curso. Es una estimación: la comisión exacta de Stripe varía por tarjeta.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          tone="brand"
          label="Ingresos (MRR)"
          value={formatCents(eco.revenueCents, "EUR")}
          hint={`${eco.proActive} Pro × 29 €`}
        />
        <StatTile
          icon={TrendingDown}
          tone="warning"
          label="Costes del mes"
          value={formatCents(eco.totalCostCents, "EUR")}
          hint="fijos + Stripe + mensajería"
        />
        <StatTile
          icon={eco.profitCents >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
          label="Beneficio"
          value={formatCents(eco.profitCents, "EUR")}
          hint={
            eco.marginPercent === null
              ? "sin ingresos aún"
              : `margen del ${eco.marginPercent}%`
          }
        />
        <StatTile
          icon={Target}
          tone="info"
          label="Punto de equilibrio"
          value={
            eco.breakEvenBusinesses === null
              ? "—"
              : `${eco.breakEvenBusinesses} negocio${eco.breakEvenBusinesses === 1 ? "" : "s"} Pro`
          }
          hint="para cubrir los costes fijos"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            <Receipt className="h-4 w-4 text-ink-muted" aria-hidden />
            Desglose del mes
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-ink-soft">
                <PiggyBank className="h-4 w-4 text-ink-muted" aria-hidden />
                Costes fijos (hosting, dominio…)
              </dt>
              <dd className="tabular-nums text-ink">
                {formatCents(eco.fixedCostCents, "EUR")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">
                Comisiones de Stripe ({eco.proActive} cobro
                {eco.proActive === 1 ? "" : "s"})
              </dt>
              <dd className="tabular-nums text-ink">
                {formatCents(eco.stripeCostCents, "EUR")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-ink-soft">
                <MessageCircle className="h-4 w-4 text-ink-muted" aria-hidden />
                Mensajería ({eco.whatsappSentThisMonth} WhatsApp ·{" "}
                {eco.smsSentThisMonth} SMS enviados)
              </dt>
              <dd className="tabular-nums text-ink">
                {formatCents(eco.messagingCostCents, "EUR")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-2.5 font-semibold">
              <dt className="text-ink">Total costes</dt>
              <dd className="tabular-nums text-ink">
                {formatCents(eco.totalCostCents, "EUR")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink">Beneficio del mes</dt>
              <dd
                className={`tabular-nums font-bold ${
                  eco.profitCents >= 0
                    ? "text-success-strong"
                    : "text-danger-strong"
                }`}
              >
                {formatCents(eco.profitCents, "EUR")}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Con WhatsApp por Evolution API (autoalojado) puedes poner su coste
            a 0 €; con la API oficial de Meta, los recordatorios rondan
            0,013 €/mensaje.
          </p>
        </Card>

        <EconomySettingsForm settings={eco.settings} />
      </div>
    </div>
  );
}
