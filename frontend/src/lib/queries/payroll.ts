import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AcademyPayrollSummary, TeacherPayrollReport } from "../types";

export function useTeacherPayroll(teacherId?: number, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["teachers", teacherId, "payroll", { dateFrom, dateTo }],
    enabled: !!teacherId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const url = `/teachers/${teacherId}/payroll${params.toString() ? `?${params.toString()}` : ""}`;
      return (await api.get<TeacherPayrollReport>(url)).data;
    },
  });
}

export function useAcademyPayrollSummary(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["teachers", "payroll", "summary", { dateFrom, dateTo }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const url = `/teachers/payroll/summary${params.toString() ? `?${params.toString()}` : ""}`;
      return (await api.get<AcademyPayrollSummary>(url)).data;
    },
  });
}

export function useUpdateTeacherRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teacherId,
      hourlyRate,
      effectiveFrom,
    }: {
      teacherId: number;
      hourlyRate: number;
      /** Desde cuándo rige. Sin fecha, desde hoy; lo ya liquidado no cambia. */
      effectiveFrom?: string;
    }) => {
      return (
        await api.patch<{
          teacher_id: number;
          hourly_rate: number;
          effective_from: string;
          message: string;
        }>(`/teachers/${teacherId}/rate`, {
          hourly_rate: hourlyRate,
          ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
        })
      ).data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["teachers", vars.teacherId, "payroll"] });
      qc.invalidateQueries({ queryKey: ["teachers", "payroll", "summary"] });
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
