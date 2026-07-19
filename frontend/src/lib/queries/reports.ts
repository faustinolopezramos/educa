import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { Report } from "../types";

export const useReport = (period: string, anchor?: string) =>
  useQuery({
    queryKey: ["report", period, anchor ?? "today"],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (anchor) params.set("anchor", anchor);
      return (await api.get<Report>(`/reports?${params.toString()}`)).data;
    },
  });

export async function downloadReport(
  format: "csv" | "pdf",
  period: string,
  anchor?: string,
) {
  const params = new URLSearchParams({ period, format });
  if (anchor) params.set("anchor", anchor);
  const res = await api.get(`/reports/export?${params.toString()}`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte_${period}_${anchor ?? "hoy"}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
