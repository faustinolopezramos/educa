import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Course, CourseTeacher, Language, Level, UserBrief } from "../types";
import { useList } from "./common";

// ---- Languages ----
export const useLanguages = () =>
  useList<Language>(["languages"], "/catalog/languages");

export function useCreateLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (await api.post("/catalog/languages", { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["languages"] }),
  });
}

export function useUpdateLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) =>
      (await api.patch(`/catalog/languages/${id}`, { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["languages"] }),
  });
}

export function useDeleteLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/catalog/languages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["languages"] }),
  });
}

// ---- Levels ----
export const useLevels = () => useList<Level>(["levels"], "/catalog/levels");

export function useCreateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      language_id: number;
      code: string;
      name: string;
    }) => (await api.post("/catalog/levels", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["levels"] }),
  });
}

export function useUpdateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: number;
      language_id?: number;
      code?: string;
      name?: string;
    }) => (await api.patch(`/catalog/levels/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["levels"] }),
  });
}

export function useDeleteLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/catalog/levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["levels"] }),
  });
}

// ---- Courses ----
export const useCourses = () => useList<Course>(["courses"], "/catalog/courses");

export interface CoursePayload {
  level_id: number;
  name: string;
  max_students: number;
  start_date?: string | null;
  end_date?: string | null;
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CoursePayload) =>
      (await api.post("/catalog/courses", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CoursePayload> & { id: number }) =>
      (await api.patch(`/catalog/courses/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/catalog/courses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

// ---- Course ↔ teacher assignment ----
export const useCourseTeachers = (courseId?: number) =>
  useQuery({
    queryKey: ["course-teachers", courseId],
    enabled: !!courseId,
    queryFn: async () =>
      (await api.get<CourseTeacher[]>(`/catalog/courses/${courseId}/teachers`)).data,
  });

export function useAssignCourseTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      courseId,
      teacher_id,
      is_lead,
    }: {
      courseId: number;
      teacher_id: number;
      is_lead?: boolean;
    }) =>
      (
        await api.post<CourseTeacher>(`/catalog/courses/${courseId}/teachers`, {
          teacher_id,
          is_lead: is_lead ?? false,
        })
      ).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["course-teachers", v.courseId] }),
  });
}

export function useUnassignCourseTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      courseId,
      teacherId,
    }: {
      courseId: number;
      teacherId: number;
    }) => api.delete(`/catalog/courses/${courseId}/teachers/${teacherId}`),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["course-teachers", v.courseId] }),
  });
}

export const useCourseStudents = (courseId?: number) =>
  useQuery({
    queryKey: ["course-students", courseId],
    enabled: !!courseId,
    queryFn: async () =>
      (await api.get<UserBrief[]>(`/catalog/courses/${courseId}/students`)).data,
  });
