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
      qc.invalidateQueries({ queryKey: ["session", data.id] });
      qc.invalidateQueries({ queryKey: ["sessions", "mine"] });
    },
  });
}

/**
 * Everything that goes stale when a class stops being held as planned.
 *
 * The prefix matters: sessions are cached under three shapes —
 * `["sessions","mine"]` (the student's), `["sessions", scheduleId]` (the
 * teacher's class detail) and nothing at all under `["sessions","all"]`, which
 * these two mutations used to invalidate. So cancelling a class refreshed a key
 * no query reads and left untouched the very list the teacher was looking at:
 * the dropdown kept offering the cancelled session with no "cancelada" mark
 * until the panel was remounted.
 *
 * `["sessions"]` covers all three, present and future.
 */
function invalidateSessionViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["sessions"] });
  qc.invalidateQueries({ queryKey: ["report"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  // Cancelar y reprogramar avisan al alumno por la campana.
  qc.invalidateQueries({ queryKey: ["notifications"] });
}

export function useCancelSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) =>
      (await api.post<ClassSession>(`/sessions/${id}/cancel`, { reason })).data,
    onSuccess: () => invalidateSessionViews(qc),
  });
}

export function useRescheduleSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, new_date }: { id: number; new_date: string }) =>
      (await api.post<ClassSession>(`/sessions/${id}/reschedule`, { new_date })).data,
    onSuccess: () => invalidateSessionViews(qc),
  });
}

/**
 * Cerrar la lista del día: "esta lista está completa".
 *
 * `force` cubre el caso real de un alumno que no aparecerá y a quien el profesor
 * no quiere marcar; sin él la API exige que todos los que ocupan plaza tengan
 * marca y devuelve en el error cuántos faltan.
 */
export function useCloseRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: number; force?: boolean }) =>
      (
        await api.post<ClassSession>(
          `/sessions/${id}/close-register${force ? "?force=true" : ""}`,
        )
      ).data,
    onSuccess: () => invalidateSessionViews(qc),
  });
}

export function useReopenRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.post<ClassSession>(`/sessions/${id}/reopen-register`)).data,
    onSuccess: () => invalidateSessionViews(qc),
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
