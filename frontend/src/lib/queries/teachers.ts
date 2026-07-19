import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { TeacherAvailability, TeacherLanguage } from "../types";

export const useTeacherLanguages = (teacherId?: number) =>
  useQuery({
    queryKey: ["teacher-languages", teacherId],
    enabled: !!teacherId,
    queryFn: async () =>
      (await api.get<TeacherLanguage[]>(`/teachers/${teacherId}/languages`)).data,
  });

export function useSetTeacherLanguages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teacherId,
      language_ids,
    }: {
      teacherId: number;
      language_ids: number[];
    }) =>
      (await api.put(`/teachers/${teacherId}/languages`, { language_ids })).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["teacher-languages", v.teacherId] }),
  });
}

export const useTeacherAvailability = (teacherId?: number) =>
  useQuery({
    queryKey: ["teacher-availability", teacherId],
    enabled: !!teacherId,
    queryFn: async () =>
      (await api.get<TeacherAvailability[]>(`/teachers/${teacherId}/availability`))
        .data,
  });

export function useAddAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teacherId,
      ...payload
    }: {
      teacherId: number;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }) => (await api.post(`/teachers/${teacherId}/availability`, payload)).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["teacher-availability", v.teacherId] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teacherId,
      id,
    }: {
      teacherId: number;
      id: number;
    }) => api.delete(`/teachers/${teacherId}/availability/${id}`),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["teacher-availability", v.teacherId] }),
  });
}
