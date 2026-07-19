import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { LocationProposal } from "../types";
import { useList } from "./common";

export const useLocationProposals = (status?: string) =>
  useList<LocationProposal>(
    ["location-proposals", status ?? "all"],
    status ? `/location-proposals?status_filter=${status}` : "/location-proposals",
  );

export function useProposeLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      ...body
    }: {
      scheduleId: number;
      modality: string;
      room_id?: number | null;
      provider?: string | null;
      join_url?: string | null;
    }) =>
      (await api.post<LocationProposal>(`/schedules/${scheduleId}/location/propose`, body))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-proposals"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useReviewProposal() {
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
        await api.post<LocationProposal>(
          `/location-proposals/${id}/${action}`,
          action === "reject" ? { note } : {},
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-proposals"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}
