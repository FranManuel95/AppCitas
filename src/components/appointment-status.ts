import {
  CalendarCheck2,
  CheckCircle2,
  CircleSlash,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { AppointmentStatus } from "@/lib/domain/types";
import type { Tone } from "@/lib/design/tokens";

/**
 * Mapa único estado de cita → tono semántico + icono.
 * Lo consumen StatusBadge (badge con `TONE_COLORS[tone]` vía clases) y los
 * gráficos del dashboard (`TONE_COLORS[tone].chart`), de modo que un estado
 * se vea siempre del mismo color en toda la app.
 */
export const APPOINTMENT_STATUS_UI: Record<
  AppointmentStatus,
  { tone: Tone; icon: LucideIcon }
> = {
  CONFIRMED: { tone: "info", icon: CalendarCheck2 },
  COMPLETED: { tone: "success", icon: CheckCircle2 },
  CANCELLED: { tone: "neutral", icon: CircleSlash },
  CANCELLED_LATE: { tone: "warning", icon: TriangleAlert },
  NO_SHOW: { tone: "danger", icon: UserX },
};
