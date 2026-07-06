import Link from "next/link";
import { Megaphone, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { effectivePlan } from "@/lib/domain/plans";
import {
  getBusinessCampaigns,
  getSegmentCounts,
} from "@/lib/domain/campaigns";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { CampaignForm } from "@/components/admin/campaign-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing" };

const SEGMENT_LABELS: Record<string, string> = {
  ALL: "Todos",
  NEW: "Nuevos (30 días)",
  LOYAL: "Fieles (3+ visitas)",
  INACTIVE: "Inactivos (60 días)",
};
const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
};

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Campañas a la cartera de clientes con segmentación calculada. Los envíos
// van por el outbox (misma fiabilidad y marca que los recordatorios).
export default async function MarketingPage() {
  const admin = await requireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { plan: true, subscriptionStatus: true },
  });
  const isPro = effectivePlan(business).id === "pro";
  const [counts, campaigns] = await Promise.all([
    getSegmentCounts(admin.businessId),
    getBusinessCampaigns(admin.businessId),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Marketing"
        description="Envía campañas a tu cartera por email, WhatsApp o SMS, con segmentos calculados sobre tu historial real de citas."
      />

      {!isPro && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Las campañas de marketing son una función del plan Pro.
          </span>
          <Link
            href="/admin/plan"
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
          >
            Mejorar a Pro
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <CampaignForm
          disabled={!isPro}
          segments={[
            { id: "ALL", label: SEGMENT_LABELS.ALL, count: counts.ALL },
            { id: "NEW", label: SEGMENT_LABELS.NEW, count: counts.NEW },
            { id: "LOYAL", label: SEGMENT_LABELS.LOYAL, count: counts.LOYAL },
            {
              id: "INACTIVE",
              label: SEGMENT_LABELS.INACTIVE,
              count: counts.INACTIVE,
            },
          ]}
        />

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            <Megaphone className="h-4 w-4 text-ink-muted" aria-hidden />
            Historial
          </h2>
          <ul className="mt-4 space-y-3">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm"
              >
                <p className="line-clamp-2 text-ink">
                  {c.subject ? `${c.subject} — ` : ""}
                  {c.body}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <Badge tone="neutral">{CHANNEL_LABELS[c.channel]}</Badge>
                  <span>{SEGMENT_LABELS[c.segment] ?? c.segment}</span>
                  <span className="tabular-nums">
                    {c.recipientCount} destinatario
                    {c.recipientCount === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums">
                    {dateFmt.format(c.createdAt)}
                  </span>
                </div>
              </li>
            ))}
            {campaigns.length === 0 && (
              <li className="text-sm text-ink-muted">
                Aún no has enviado ninguna campaña.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
