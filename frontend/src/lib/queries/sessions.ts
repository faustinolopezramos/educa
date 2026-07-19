import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { ClassSession, SessionStatus } from "../types";
import { useList } from "./common";

export const useSessions = (scheduleId?: number) =>
  useQuery({
    queryKey: ["sessions", scheduleId],
    enabled: !!scheduleId,
    queryFn: async () =>
      (await api.get<ClassSession[]>(`/sessions?schedule_id=${scheduleId}`)).data,
  });

export const useMySessions = () =>
  useList<ClassSession>(["sessions", "mine"], "/sessions");

export const useSession = (id: number) =>
  useQuery({
    queryKey: ["session", id],
    queryFn: async () => (await api.get<ClassSession>(`/sessions/${id}`)).data,
  });

export function useGenerateSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: number) =>
      (await api.post<ClassSession[]>("/sessions/generate", { schedule_id: scheduleId }))
        .data,
    onSuccess: (_d, scheduleId) =>
      qc.invalidateQueries({ queryKey: ["sessions", scheduleId] }),
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: number;
      status?: SessionStatus;
      topic?: string | null;
    }) => (await api.patch<ClassSession>(`/sessions/${id}`, patch)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session", data.id] });
    },
  });
}

export function useCancelSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) =>
      (await api.post<ClassSession>(`/sessions/${id}/cancel`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRescheduleSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, new_date }: { id: number; new_date: string }) =>
      (await api.post<ClassSession>(`/sessions/${id}/reschedule`, { new_date })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useEnsureSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      schedule_id,
      date,
    }: {
      schedule_id: number;
      date: string;
    }) =>
      (await api.post<ClassSession>("/sessions/ensure", { schedule_id, date })).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["sessions", v.schedule_id] }),
  });
}
