"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHROME, INK, SERIES_PRIMARY } from "@/lib/design/tokens";

export interface CohortPointDTO {
  month: string; // "YYYY-MM"
  newClients: number;
  returned: number;
  retentionPercent: number | null;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// % de retención por cohorte (mes de primera visita). La tabla equivalente la
// pinta la página en servidor; aquí solo va la gráfica.
export function RetentionChart({ cohorts }: { cohorts: CohortPointDTO[] }) {
  const data = cohorts.map((c) => ({
    month: c.month,
    retencion: c.retentionPercent ?? 0,
    nuevos: c.newClients,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHROME.grid} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tick={{ fill: INK.muted, fontSize: 11 }}
            axisLine={{ stroke: CHROME.axis }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: INK.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(22,22,29,0.04)" }}
            formatter={(value) => `${value}%`}
            labelFormatter={(label) => monthLabel(String(label))}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar
            dataKey="retencion"
            name="% retención"
            fill={SERIES_PRIMARY}
            barSize={18}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
