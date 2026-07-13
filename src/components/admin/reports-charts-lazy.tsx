"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Carga diferida (recharts pesa) — mismo patrón que dashboard-charts-lazy.

export type { CohortPointDTO } from "@/components/admin/reports-charts";

export const RetentionChart = dynamic(
  () =>
    import("@/components/admin/reports-charts").then((m) => m.RetentionChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
