import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Certificate, CourseEvaluation, FinalGrade, Grade } from "../types";
import { useList } from "./common";

// ---- Grades ----
// Shared with the optimistic updates below, so a future change to this key
// can't silently desync the cache read from the cache write.
export const GRADES_ALL_KEY = ["grades", "all"] as const;

/**
 * Everything the server recomputes when a score changes.
 *
 * The final grade is *derived* server-side from the grades, and nothing here
 * ever invalidated it: a teacher entered the exam that closed the course, the
 * cell updated, and the "Nota final — Aprobado/No aprobado" row kept showing
 * the previous verdict for the rest of the session. The certificate is issued
 * against that number, so the stale one was the one being acted on.
 *
 * The report and the dashboard tray read the same scores, so they go with it.
 */
function invalidateDerivedFromGrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["final-grade"] });
  qc.invalidateQueries({ queryKey: ["report"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

// `enabled` exists because the API answers a student with unpaid fees 403, and
// every 403 raises the global "no tienes permisos" toast. The caller that
// already knows the student is delinquent — and is showing them the proper
// explanation — must be able to not ask at all.
export const useGrades = (enrollmentId?: number, enabled = true) =>
  useList<Grade>(
    enrollmentId ? ["grades", enrollmentId] : [...GRADES_ALL_KEY],
    enrollmentId ? `/grades?enrollment_id=${enrollmentId}` : "/grades",
    enabled,
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
    onMutate: async (payload) => {
      const key = GRADES_ALL_KEY;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Grade[]>(key);
      if (prev) {
        const optimistic: Grade = {
          id: -Date.now(),
          enrollment_id: payload.enrollment_id,
          session_id: payload.session_id ?? null,
          evaluation_name: payload.evaluation_name,
          score: payload.score,
        };
        qc.setQueryData<Grade[]>(key, [...prev, optimistic]);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GRADES_ALL_KEY, ctx.prev);
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["grades", v.enrollment_id] });
      qc.invalidateQueries({ queryKey: GRADES_ALL_KEY });
      invalidateDerivedFromGrades(qc);
    },
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
    onMutate: async ({ id, ...patch }) => {
      const key = GRADES_ALL_KEY;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Grade[]>(key);
      if (prev) {
        qc.setQueryData<Grade[]>(
          key,
          prev.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GRADES_ALL_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["grades"] });
      invalidateDerivedFromGrades(qc);
    },
  });
}

// ---- Final grade, evaluation weights, certificates ----
export const useFinalGrade = (enrollmentId?: number, enabled = true) =>
  useQuery({
    queryKey: ["final-grade", enrollmentId],
    // Same 403-on-unpaid-fees rule as `useGrades` above.
    enabled: !!enrollmentId && enabled,
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
