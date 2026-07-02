"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Carga diferida de las gráficas (recharts pesa): se excluyen del bundle
// inicial y del SSR, mostrando un Skeleton del mismo alto mientras llegan.

export type {
  MonthlyPointDTO,
  ServiceStatDTO,
} from "@/components/admin/dashboard-charts";

export const RevenueChart = dynamic(
  () =>
    import("@/components/admin/dashboard-charts").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export const StatusChart = dynamic(
  () =>
    import("@/components/admin/dashboard-charts").then((m) => m.StatusChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export const TopServicesChart = dynamic(
  () =>
    import("@/components/admin/dashboard-charts").then(
      (m) => m.TopServicesChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
