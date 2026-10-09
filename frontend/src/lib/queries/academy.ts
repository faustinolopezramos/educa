import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { AcademyPlan } from "../types";

/** El plan de la propia academia (sólo su administrador). */
export const useAcademyPlan = (enabled = true) =>
  useQuery({
    queryKey: ["academy", "plan"],
    queryFn: async () => (await api.get<AcademyPlan>("/academy/plan")).data,
    enabled,
  });

/** Pedir un plan: queda pendiente hasta que el superadmin lo active. */
export function useRequestPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: string) =>
      (await api.post<AcademyPlan>("/academy/plan-request", { plan })).data,
    onSuccess: (data) => qc.setQueryData(["academy", "plan"], data),
  });
}

export function useCancelPlanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete<AcademyPlan>("/academy/plan-request")).data,
    onSuccess: (data) => qc.setQueryData(["academy", "plan"], data),
  });
}
