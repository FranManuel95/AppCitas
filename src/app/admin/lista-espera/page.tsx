import { Hourglass, Mail, Phone, User } from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getBusinessWaitlist } from "@/lib/domain/waitlist";
import { getDict, intlLocale } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WaitlistRemoveButton } from "@/components/admin/waitlist-remove-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de espera" };

export default async function AdminWaitlistPage() {
  const admin = await requireBusinessAdmin();
  const { locale } = await getDict();
  const entries = await getBusinessWaitlist(admin.businessId);

  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const formatDay = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

  // Agrupar por día (las entradas ya vienen ordenadas por desiredDate asc).
  const groups: Array<{ day: string; items: typeof entries }> = [];
  for (const e of entries) {
    let group = groups.at(-1);
    if (!group || group.day !== e.desiredDate) {
      group = { day: e.desiredDate, items: [] };
      groups.push(group);
    }
    group.items.push(e);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Lista de espera"
        description={
          entries.length === 0
            ? "Aquí verás a los clientes que esperan un hueco."
            : `${entries.length} cliente(s) esperando un hueco. Al cancelarse una cita se les avisa automáticamente.`
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="Nadie en lista de espera"
          description="Cuando un cliente no encuentre hueco para un día podrá apuntarse, y aparecerá aquí como demanda."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Hourglass className="h-4 w-4 text-ink-muted" aria-hidden />
                {formatDay(group.day)}
                <Badge tone="neutral">{group.items.length}</Badge>
              </h2>
              <div className="space-y-3">
                {group.items.map((e) => (
                  <Card
                    key={e.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-ink">
                        <User
                          className="h-4 w-4 shrink-0 text-ink-muted"
                          aria-hidden
                        />
                        {e.client.name}
                      </p>
                      <p className="mt-1 pl-6 text-sm text-ink-soft">
                        {e.service.name}
                        {e.staff ? ` · ${e.staff.name}` : " · cualquier profesional"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-ink-muted">
                        {e.client.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            {e.client.email}
                          </span>
                        )}
                        {e.client.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            {e.client.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={e.status === "NOTIFIED" ? "success" : "neutral"}>
                        {e.status === "NOTIFIED" ? "Avisado" : "A la espera"}
                      </Badge>
                      <WaitlistRemoveButton entryId={e.id} />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
