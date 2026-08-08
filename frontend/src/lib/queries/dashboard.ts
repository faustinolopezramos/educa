import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { AcademyKpis, DashboardSummary } from "../types";

/**
 * The caller's tray of things waiting on them.
 *
 * Short `staleTime`: this is the first thing every role reads on arrival, and
 * an admin who just registered a payment should not still be told the matrícula
 * is in arrears.
 */
export const useDashboard = () =>
  useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard")).data,
    staleTime: 30_000,
  });

export const useExecutiveKpis = () =>
  useQuery({
    queryKey: ["executive-kpis"],
    queryFn: async () => (await api.get<AcademyKpis>("/dashboard/executive-kpis")).data,
    staleTime: 30_000,
  });
