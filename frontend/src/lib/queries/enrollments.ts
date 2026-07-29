import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Enrollment } from "../types";
import { useList } from "./common";

export const useEnrollments = (courseId?: number) =>
  useList<Enrollment>(
    ["enrollments", courseId ?? "all"],
    courseId ? `/enrollments?course_id=${courseId}` : "/enrollments",
  );

export function useCreateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      force,
      ...payload
    }: {
      student_id: number;
      course_id: number;
      amount?: number;
      /** When the cuota falls due; drives the "en mora" status. */
      due_date?: string;
      force?: boolean;
    }) =>
      (
        await api.post<Enrollment>(
          `/enrollments${force ? "?force=true" : ""}`,
          payload,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  });
}

export function useUpdateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<Enrollment> & { id: number }) =>
      (await api.patch<Enrollment>(`/enrollments/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  });
}

export function useDeleteEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/enrollments/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  });
}
