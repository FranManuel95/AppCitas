import {
  STATUS_LABELS,
  type AppointmentStatus,
} from "@/lib/domain/types";

const STYLES: Record<AppointmentStatus, string> = {
  CONFIRMED: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  CANCELLED_LATE: "bg-amber-100 text-amber-700",
  NO_SHOW: "bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as AppointmentStatus;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[s] ?? "bg-slate-100 text-slate-600"}`}
    >
      {STATUS_LABELS[s] ?? status}
    </span>
  );
}
