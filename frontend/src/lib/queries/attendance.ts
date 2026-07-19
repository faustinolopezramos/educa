import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Attendance, AttendanceStatus } from "../types";
import { useList } from "./common";

export const useAttendance = (enrollmentId?: number) =>
  useList<Attendance>(
    ["attendance", enrollmentId ?? "all"],
    enrollmentId ? `/attendance?enrollment_id=${enrollmentId}` : "/attendance",
    enrollmentId !== undefined,
  );

export const useVisibleAttendance = () =>
  useList<Attendance>(["attendance", "visible"], "/attendance");

export function useCreateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      enrollment_id: number;
      session_id: number;
      status: AttendanceStatus;
    }) => (await api.post<Attendance>("/attendance", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}
