import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Holiday } from "../types";
import { useList } from "./common";

export const useHolidays = () => useList<Holiday>(["holidays"], "/holidays");

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { date: string; name: string }) =>
      (await api.post<Holiday>("/holidays", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}
