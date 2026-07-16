import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "./api";
import type {
  Attendance,
  AvailableTeacher,
  ConflictResponse,
  Course,
  Enrollment,
  Grade,
  Language,
  Level,
  Room,
  Schedule,
  TeacherAvailability,
  TeacherLanguage,
  User,
  UserBrief,
  VirtualMeeting,
} from "./types";

// ---- Generic list hook ----
function useList<T>(key: (string | number)[], url: string, enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<T[]>(url)).data,
    enabled,
  });
}

// ---- Users ----
export const useUsers = (role?: string) =>
  useList<User>(["users", role ?? "all"], role ? `/users?role=${role}` : "/users");

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<User> & { password: string }) =>
      (await api.post<User>("/users", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<User> & { id: number; password?: string }) =>
      (await api.patch<User>(`/users/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// ---- Catalog ----
export const useLanguages = () =>
  useList<Language>(["languages"], "/catalog/languages");
export const useLevels = () => useList<Level>(["levels"], "/catalog/levels");
export const useCourses = () => useList<Course>(["courses"], "/catalog/courses");

export function useCreateLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (await api.post("/catalog/languages", { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["languages"] }),
  });
}

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

// Roster of one course (id + name only). Available to admins and to the
// teachers of that course — unlike /users, which is admin-only.
export const useCourseStudents = (courseId?: number) =>
  useQuery({
    queryKey: ["course-students", courseId],
    enabled: !!courseId,
    queryFn: async () =>
      (await api.get<UserBrief[]>(`/catalog/courses/${courseId}/students`)).data,
  });

// ---- Rooms ----
export const useRooms = () => useList<Room>(["rooms"], "/rooms");

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      capacity?: number | null;
      is_virtual?: boolean;
    }) => (await api.post<Room>("/rooms", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Room> & { id: number }) =>
      (await api.patch<Room>(`/rooms/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/rooms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

// ---- Schedules ----
export const useSchedules = (mine = false) =>
  useList<Schedule>(
    ["schedules", mine ? "mine" : "all"],
    mine ? "/schedules?mine=true" : "/schedules",
  );

export interface SchedulePayload {
  course_id: number;
  teacher_id: number;
  room_id?: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      force,
      ...payload
    }: SchedulePayload & { force?: boolean }) =>
      (
        await api.post<Schedule>(
          `/schedules${force ? "?force=true" : ""}`,
          payload,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      force,
      ...patch
    }: Partial<SchedulePayload> & { id: number; force?: boolean }) =>
      (
        await api.patch<Schedule>(
          `/schedules/${id}${force ? "?force=true" : ""}`,
          patch,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

// Live conflict check used by the calendar (does not mutate anything).
export function useCheckScheduleConflict() {
  return useMutation({
    mutationFn: async (payload: {
      teacher_id: number;
      room_id?: number | null;
      course_id?: number | null;
      day_of_week: number;
      start_time: string;
      end_time: string;
      exclude_id?: number;
    }) =>
      (await api.post<ConflictResponse>("/schedules/check-conflict", payload)).data,
  });
}

// Public list of teachers (id + name) for any authenticated user (e.g. students).
export const usePublicTeachers = () =>
  useList<AvailableTeacher>(["public-teachers"], "/teachers");

// Teachers qualified + available + free for a given slot.
export function useAvailableTeachers() {
  return useMutation({
    mutationFn: async (params: {
      course_id: number;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }) =>
      (
        await api.get<AvailableTeacher[]>("/schedules/available-teachers", {
          params,
        })
      ).data,
  });
}

// ---- Enrollments ----
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

// ---- Attendance ----
export const useAttendance = (enrollmentId?: number) =>
  useList<Attendance>(
    ["attendance", enrollmentId ?? "all"],
    enrollmentId ? `/attendance?enrollment_id=${enrollmentId}` : "/attendance",
    enrollmentId !== undefined,
  );

// All attendance visible to the caller (a student sees only their own).
export const useMyAttendance = () =>
  useList<Attendance>(["attendance", "mine"], "/attendance");

export function useCreateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      enrollment_id: number;
      date: string;
      status: string;
    }) => (await api.post("/attendance", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

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

// ---- Meetings ----
export const useMeetings = (scheduleId?: number) =>
  useList<VirtualMeeting>(
    ["meetings", scheduleId ?? "all"],
    scheduleId ? `/meetings?schedule_id=${scheduleId}` : "/meetings",
  );

export const useMeeting = (id: number) =>
  useQuery({
    queryKey: ["meeting", id],
    queryFn: async () => (await api.get<VirtualMeeting>(`/meetings/${id}`)).data,
  });

// ---- Teacher qualifications & availability ----
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
