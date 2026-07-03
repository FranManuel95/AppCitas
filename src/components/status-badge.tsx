import { type AppointmentStatus } from "@/lib/domain/types";
import { APPOINTMENT_STATUS_UI } from "@/components/appointment-status";
import { Badge } from "@/components/ui/badge";
import { getDict } from "@/lib/i18n";

// Componente de servidor: traduce la etiqueta del estado según el idioma del
// usuario. Todas sus llamadas son desde páginas de servidor (admin, mis-citas,
// portal del empleado, confirmación pública), así que puede leer el diccionario.
export async function StatusBadge({ status }: { status: string }) {
  const s = status as AppointmentStatus;
  const ui = APPOINTMENT_STATUS_UI[s];
  const { t } = await getDict();
  return (
    <Badge tone={ui?.tone ?? "neutral"} icon={ui?.icon}>
      {t.status[s] ?? status}
    </Badge>
  );
}
