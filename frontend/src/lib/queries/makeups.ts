import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CandidateSession, MakeUpCredit, MakeUpStatus } from "../types";

export function useMakeUpCredits(studentId?: number, status?: MakeUpStatus) {
  return useQuery({
    queryKey: ["makeups", { studentId, status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (studentId) params.set("student_id", String(studentId));
      if (status) params.set("status_filter", status);
      const url = `/makeups${params.toString() ? `?${params.toString()}` : ""}`;
      return (await api.get<MakeUpCredit[]>(url)).data;
    },
  });
}

export function useCandidateSessions(creditId?: number) {
  return useQuery({
    queryKey: ["makeups", creditId, "candidates"],
    enabled: !!creditId,
    queryFn: async () => {
      return (await api.get<CandidateSession[]>(`/makeups/${creditId}/candidates`)).data;
    },
  });
}

export function useBookMakeUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creditId,
      targetSessionId,
    }: {
      creditId: number;
      targetSessionId: number;
    }) => {
      return (
        await api.post<MakeUpCredit>(`/makeups/${creditId}/book`, {
          target_session_id: targetSessionId,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["makeups"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCancelMakeUpBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creditId: number) => {
      return (await api.post<MakeUpCredit>(`/makeups/${creditId}/cancel-booking`)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["makeups"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCreateMakeUpCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      student_id: number;
      enrollment_id: number;
      origin_session_id?: number | null;
      expires_at?: string | null;
      notes?: string | null;
    }) => {
      return (await api.post<MakeUpCredit>("/makeups", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["makeups"] });
    },
  });
}
