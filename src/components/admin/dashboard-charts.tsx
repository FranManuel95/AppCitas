"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/domain/types";
import {
  CHROME,
  INK,
  SERIES_PRIMARY,
  TONE_COLORS,
} from "@/lib/design/tokens";
import { APPOINTMENT_STATUS_UI } from "@/components/appointment-status";
import { SectionHeader } from "@/components/ui/section-header";

// Colores de estado compartidos con StatusBadge: mismo estado, mismo color.
const STATUS_COLOR = {
  completed: TONE_COLORS[APPOINTMENT_STATUS_UI.COMPLETED.tone].chart,
  cancelled: TONE_COLORS[APPOINTMENT_STATUS_UI.CANCELLED.tone].chart,
  cancelledLate: TONE_COLORS[APPOINTMENT_STATUS_UI.CANCELLED_LATE.tone].chart,
  noShow: TONE_COLORS[APPOINTMENT_STATUS_UI.NO_SHOW.tone].chart,
} as const;

// Etiquetas visibles de las gráficas: castellano por defecto, el dashboard
// pasa las del diccionario activo (los nombres de serie de estado siguen en
// STATUS_LABELS — limitación aceptada).
export interface ChartLabels {
  revenueChartTitle: string;
  revenueChartSubtitle: string;
  statusChartTitle: string;
  statusChartSubtitle: string;
  topServicesTitle: string;
  topServicesSubtitle: string;
  viewDataTable: string;
  chartMonth: string;
  chartRevenue: string;
  chartService: string;
  chartAppointments: string;
}

export const DEFAULT_CHART_LABELS: ChartLabels = {
  revenueChartTitle: "Ingresos mensuales",
  revenueChartSubtitle: "Últimos 12 meses · importes efectivamente cobrados",
  statusChartTitle: "Citas por estado",
  statusChartSubtitle:
    "Últimos 12 meses · el color indica el desenlace de la cita",
  topServicesTitle: "Top servicios",
  topServicesSubtitle: "Por ingresos en los últimos 12 meses",
  viewDataTable: "Ver tabla de datos",
  chartMonth: "Mes",
  chartRevenue: "Ingresos",
  chartService: "Servicio",
  chartAppointments: "Citas",
};

export interface MonthlyPointDTO {
  month: string; // "YYYY-MM"
  revenueCents: number;
  completed: number;
  cancelled: number;
  cancelledLate: number;
  noShow: number;
  total: number;
}

export interface ServiceStatDTO {
  serviceId: string;
  name: string;
  count: number;
  revenueCents: number;
}

function monthLabel(month: string, dateLocale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(dateLocale, {
    month: "short",
    timeZone: "UTC",
  });
}

function monthLabelLong(month: string, dateLocale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(dateLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ChartTooltip({
  active,
  label,
  payload,
  currency,
  isMoney,
  dateLocale,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color?: string }>;
  currency: string;
  isMoney?: boolean;
  dateLocale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium" style={{ color: INK.primary }}>
        {label ? monthLabelLong(label, dateLocale) : ""}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span style={{ color: INK.secondary }}>
              {entry.name}:{" "}
              {isMoney ? formatCents(entry.value * 100, currency) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Vista de tabla: canal accesible equivalente de cada gráfica.
function TableView({
  caption,
  headers,
  rows,
  summaryLabel,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  summaryLabel: string;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-ink-muted transition-colors hover:text-ink-soft">
        {summaryLabel}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              {headers.map((h) => (
                <th key={h} className="py-1.5 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border text-ink-soft">
                {row.map((cell, j) => (
                  <td key={j} className="py-1.5 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RevenueChart({
  monthly,
  currency,
  labels = DEFAULT_CHART_LABELS,
  dateLocale = "es-ES",
}: {
  monthly: MonthlyPointDTO[];
  currency: string;
  labels?: ChartLabels;
  dateLocale?: string;
}) {
  const data = monthly.map((m) => ({
    month: m.month,
    ingresos: m.revenueCents / 100,
  }));

  return (
    <div className="card">
      <SectionHeader
        as="h2"
        title={labels.revenueChartTitle}
        description={labels.revenueChartSubtitle}
      />
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid
              vertical={false}
              stroke={CHROME.grid}
              strokeWidth={1}
            />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => monthLabel(m, dateLocale)}
              tick={{ fill: INK.muted, fontSize: 11 }}
              axisLine={{ stroke: CHROME.axis }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: INK.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat(dateLocale, {
                  style: "currency",
                  currency,
                  maximumFractionDigits: 0,
                }).format(v)
              }
            />
            <Tooltip
              cursor={{ fill: "rgba(22,22,29,0.04)" }}
              content={<ChartTooltip currency={currency} isMoney dateLocale={dateLocale} />}
            />
            <Bar
              dataKey="ingresos"
              name={labels.chartRevenue}
              fill={SERIES_PRIMARY}
              barSize={18}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        caption={labels.revenueChartTitle}
        headers={[labels.chartMonth, labels.chartRevenue]}
        summaryLabel={labels.viewDataTable}
        rows={monthly.map((m) => [
          monthLabelLong(m.month, dateLocale),
          formatCents(m.revenueCents, currency),
        ])}
      />
    </div>
  );
}

export function StatusChart({
  monthly,
  labels = DEFAULT_CHART_LABELS,
  dateLocale = "es-ES",
}: {
  monthly: MonthlyPointDTO[];
  labels?: ChartLabels;
  dateLocale?: string;
}) {
  const data = monthly.map((m) => ({
    month: m.month,
    [STATUS_LABELS.COMPLETED]: m.completed,
    [STATUS_LABELS.CANCELLED]: m.cancelled,
    [STATUS_LABELS.CANCELLED_LATE]: m.cancelledLate,
    [STATUS_LABELS.NO_SHOW]: m.noShow,
  }));

  return (
    <div className="card">
      <SectionHeader
        as="h2"
        title={labels.statusChartTitle}
        description={labels.statusChartSubtitle}
      />
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHROME.grid} strokeWidth={1} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => monthLabel(m, dateLocale)}
              tick={{ fill: INK.muted, fontSize: 11 }}
              axisLine={{ stroke: CHROME.axis }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: INK.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "rgba(22,22,29,0.04)" }}
              content={<ChartTooltip currency="EUR" dateLocale={dateLocale} />}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
              iconSize={8}
              // La identidad la lleva el swatch; el texto va en tinta neutra
              formatter={(value: string) => (
                <span style={{ color: INK.secondary }}>{value}</span>
              )}
            />
            {/* Segmentos con trazo del color de superficie: separación sin borde */}
            <Bar
              dataKey={STATUS_LABELS.COMPLETED}
              stackId="estado"
              fill={STATUS_COLOR.completed}
              stroke={CHROME.surface}
              strokeWidth={1}
              barSize={18}
            />
            <Bar
              dataKey={STATUS_LABELS.CANCELLED}
              stackId="estado"
              fill={STATUS_COLOR.cancelled}
              stroke={CHROME.surface}
              strokeWidth={1}
              barSize={18}
            />
            <Bar
              dataKey={STATUS_LABELS.CANCELLED_LATE}
              stackId="estado"
              fill={STATUS_COLOR.cancelledLate}
              stroke={CHROME.surface}
              strokeWidth={1}
              barSize={18}
            />
            <Bar
              dataKey={STATUS_LABELS.NO_SHOW}
              stackId="estado"
              fill={STATUS_COLOR.noShow}
              stroke={CHROME.surface}
              strokeWidth={1}
              barSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        caption={labels.statusChartTitle}
        summaryLabel={labels.viewDataTable}
        headers={[
          labels.chartMonth,
          STATUS_LABELS.COMPLETED,
          STATUS_LABELS.CANCELLED,
          STATUS_LABELS.CANCELLED_LATE,
          STATUS_LABELS.NO_SHOW,
        ]}
        rows={monthly.map((m) => [
          monthLabelLong(m.month, dateLocale),
          m.completed,
          m.cancelled,
          m.cancelledLate,
          m.noShow,
        ])}
      />
    </div>
  );
}

export function TopServicesChart({
  services,
  currency,
  labels = DEFAULT_CHART_LABELS,
  dateLocale = "es-ES",
}: {
  services: ServiceStatDTO[];
  currency: string;
  labels?: ChartLabels;
  dateLocale?: string;
}) {
  const data = services.map((s) => ({
    name: s.name,
    ingresos: s.revenueCents / 100,
    citas: s.count,
  }));

  return (
    <div className="card">
      <SectionHeader
        as="h2"
        title={labels.topServicesTitle}
        description={labels.topServicesSubtitle}
      />
      <div className="mt-4" style={{ height: Math.max(160, data.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 76, left: 8, bottom: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fill: INK.secondary, fontSize: 12 }}
              axisLine={{ stroke: CHROME.axis }}
              tickLine={false}
            />
            <Bar
              dataKey="ingresos"
              name={labels.chartRevenue}
              fill={SERIES_PRIMARY}
              barSize={18}
              radius={[0, 4, 4, 0]}
            >
              {/* Valor en la punta de cada barra: la etiqueta lleva tinta, no color de serie */}
              <LabelList
                dataKey="ingresos"
                position="right"
                formatter={(v) =>
                  new Intl.NumberFormat(dateLocale, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  }).format(v as number)
                }
                style={{ fill: INK.secondary, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        caption={labels.topServicesTitle}
        summaryLabel={labels.viewDataTable}
        headers={[labels.chartService, labels.chartAppointments, labels.chartRevenue]}
        rows={services.map((s) => [
          s.name,
          s.count,
          formatCents(s.revenueCents, currency),
        ])}
      />
    </div>
  );
}
