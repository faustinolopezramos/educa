import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { RenewalOptions, RenewalRequest } from "../types";
import { useList } from "./common";

/** Student: the next level each graduated course leads to, and its open groups. */
export const useRenewalOptions = (enabled = true) =>
  useQuery({
    queryKey: ["renewals", "options"],
    queryFn: async () => (await api.get<RenewalOptions>("/renewals/options")).data,
    enabled,
  });

/** Staff with `manage_enrollments`: requests awaiting a decision. */
export const usePendingRenewals = (enabled = true) =>
  useList<RenewalRequest>(["renewals", "pending"], "/renewals?status_filter=pending", enabled);

export function useRequestRenewal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { from_enrollment_id: number; course_id: number }) =>
      (await api.post<RenewalRequest>("/renewals", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renewals"] }),
  });
}

export function useWithdrawRenewal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/renewals/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renewals"] }),
  });
}

export function useReviewRenewal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: number;
      action: "approve" | "reject";
      note?: string;
    }) =>
      (
        await api.post<RenewalRequest>(
          `/renewals/${id}/${action}`,
          action === "reject" ? { note } : {},
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["renewals"] });
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
