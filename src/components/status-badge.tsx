import {
  STATUS_LABELS,
  type AppointmentStatus,
} from "@/lib/domain/types";
import { APPOINTMENT_STATUS_UI } from "@/components/appointment-status";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const s = status as AppointmentStatus;
  const ui = APPOINTMENT_STATUS_UI[s];
  return (
    <Badge tone={ui?.tone ?? "neutral"} icon={ui?.icon}>
      {STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
