import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { LeaderboardEntry } from "../types";

export interface PronunciationResult {
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  prosody_score: number | null;
  pronunciation_score: number | null;
  words?: Array<{
    word: string;
    accuracy_score?: number;
    error_type?: string;
  }>;
}

export interface TutorReply {
  reply: string;
}

/** Alumno / Profesor: Evaluación de pronunciación por voz */
export function usePronunciationPractice() {
  return useMutation({
    mutationFn: async (payload: {
      course_id: number;
      audio_base64: string;
      reference_text: string;
      language?: string;
    }) => (await api.post<PronunciationResult>("/ludi/practice/pronunciation", payload)).data,
  });
}

/** Alumno / Profesor: Consulta al tutor RAG */
export function useTutorChat() {
  return useMutation({
    mutationFn: async (payload: {
      course_id: number;
      message: string;
      history?: Array<{ role: string; content: string }>;
    }) => (await api.post<TutorReply>("/ludi/tutor/chat", payload)).data,
  });
}

/** Ranking de gamificación del curso */
export function useCourseRanking(courseId: number | null) {
  return useQuery({
    queryKey: ["ludi-ranking", courseId],
    queryFn: async () =>
      courseId ? (await api.get<LeaderboardEntry[]>(`/ludi/courses/${courseId}/ranking`)).data : [],
    enabled: Boolean(courseId),
  });
}

/** Director: Solicitar el paquete Ludi */
export function useRequestLudiAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modules?: string[]) =>
      (await api.post("/ludi/addon/request", { modules: modules || ["lessons", "tutor", "voice", "live", "gamification"] })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-plan"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

/** Administrador de la academia: Activar o desactivar directamente el paquete Ludi */
export function useDirectToggleLudiAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enabled, modules }: { enabled: boolean; modules?: string[] }) =>
      (
        await api.post("/ludi/addon/toggle", {
          enabled,
          modules: modules || ["lessons", "tutor", "voice", "live", "gamification"],
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-plan"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

/** Superadmin: Activar o desactivar el paquete Ludi para una academia */
export function useToggleLudiAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      enabled,
      modules,
    }: {
      tenantId: number;
      enabled: boolean;
      modules?: string[];
    }) =>
      (
        await api.post(`/ludi/tenants/${tenantId}/activate`, {
          enabled,
          modules: modules || ["lessons", "tutor", "voice", "live", "gamification"],
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["academy-plan"] });
    },
  });
}

/** Profesor: Generar Quiz con IA */
export function useGenerateQuiz(courseId: number) {
  return useMutation({
    mutationFn: async (payload: { topic: string; questions?: number }) =>
      (await api.post(`/ludi/courses/${courseId}/quizzes/generate`, { course_id: courseId, ...payload })).data,
  });
}

/** Profesor: Iniciar partida sincrónica tipo Kahoot con PIN */
export function useCreateLiveQuizSession() {
  return useMutation({
    mutationFn: async (quizId: string) =>
      (await api.post<{ session_id: string; pin: string; status: string }>("/ludi/quizzes/live-session", { quiz_id: quizId })).data,
  });
}

/** Estado de Ludi para la academia del usuario actual */
export function useLudiStatus() {
  return useQuery({
    queryKey: ["ludi-status"],
    queryFn: async () =>
      (await api.get<{ has_ludi_addon: boolean; modules: string[] }>("/ludi/status")).data,
  });
}

/** Otorgar XP a un alumno */
export function useAwardXP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      course_id: number;
      student_id: number;
      amount: number;
      reason?: string;
    }) => (await api.post("/ludi/xp", payload)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ludi-ranking", vars.course_id] });
    },
  });
}
