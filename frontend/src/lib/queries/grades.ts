import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Certificate, CourseEvaluation, FinalGrade, Grade } from "../types";
import { useList } from "./common";

// ---- Grades ----
export const useGrades = (enrollmentId?: number) =>
  useList<Grade>(
    ["grades", enrollmentId ?? "all"],
    enrollmentId ? `/grades?enrollment_id=${enrollmentId}` : "/grades",
  );

export function useCreateGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      enrollment_id: number;
      evaluation_name: string;
      score: number;
      session_id?: number | null;
    }) => (await api.post<Grade>("/grades", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades"] }),
  });
}

export function useUpdateGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: number;
      evaluation_name?: string;
      score?: number;
    }) => (await api.patch<Grade>(`/grades/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades"] }),
  });
}

// ---- Final grade, evaluation weights, certificates ----
export const useFinalGrade = (enrollmentId?: number) =>
  useQuery({
    queryKey: ["final-grade", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () =>
      (await api.get<FinalGrade>(`/enrollments/${enrollmentId}/final-grade`)).data,
  });

export const useCourseEvaluations = (courseId?: number) =>
  useQuery({
    queryKey: ["course-evaluations", courseId],
    enabled: !!courseId,
    queryFn: async () =>
      (await api.get<CourseEvaluation[]>(`/catalog/courses/${courseId}/evaluations`)).data,
  });

export function useAddEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      courseId,
      name,
      weight,
    }: {
      courseId: number;
      name: string;
      weight: number;
    }) =>
      (await api.post(`/catalog/courses/${courseId}/evaluations`, { name, weight })).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["course-evaluations", v.courseId] }),
  });
}

export function useDeleteEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, id }: { courseId: number; id: number }) =>
      api.delete(`/catalog/courses/${courseId}/evaluations/${id}`),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["course-evaluations", v.courseId] }),
  });
}

export const useEnrollmentCertificate = (enrollmentId?: number) =>
  useQuery({
    queryKey: ["certificate", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () =>
      (await api.get<Certificate | null>(`/enrollments/${enrollmentId}/certificate`)).data,
  });

export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: number) =>
      (await api.post<Certificate>(`/enrollments/${enrollmentId}/certificate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certificate"] }),
  });
}

export const useCertificateByCode = (code?: string) =>
  useQuery({
    queryKey: ["certificate", code],
    enabled: !!code,
    queryFn: async () =>
      (await api.get<Certificate>(`/certificates/${code}`)).data,
  });

export async function downloadCertificatePdf(id: number, code: string) {
  const res = await api.get(`/certificates/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificado_${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
