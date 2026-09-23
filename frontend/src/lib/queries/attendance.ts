import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Attendance, AttendanceStatus, BulkAttendanceResponse } from "../types";
import { useList } from "./common";

export const useAttendance = (enrollmentId?: number) =>
  useList<Attendance>(
    ["attendance", enrollmentId ?? "all"],
    enrollmentId ? `/attendance?enrollment_id=${enrollmentId}` : "/attendance",
    enrollmentId !== undefined,
  );

// Shared with the optimistic update below, so a future change to this key
// can't silently desync the cache read from the cache write.
export const ATTENDANCE_VISIBLE_KEY = ["attendance", "visible"] as const;

export const useVisibleAttendance = () =>
  useList<Attendance>([...ATTENDANCE_VISIBLE_KEY], "/attendance");

export function useCreateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      enrollment_id: number;
      session_id: number;
      status: AttendanceStatus;
    }) => (await api.post<Attendance>("/attendance", payload)).data,
    onMutate: async (payload) => {
      const key = ATTENDANCE_VISIBLE_KEY;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Attendance[]>(key);
      if (prev) {
        const existing = prev.findIndex(
          (a) => a.enrollment_id === payload.enrollment_id && a.session_id === payload.session_id,
        );
        const optimistic: Attendance = {
          id: existing >= 0 ? prev[existing].id : -Date.now(),
          enrollment_id: payload.enrollment_id,
          session_id: payload.session_id,
          date: new Date().toISOString().slice(0, 10),
          status: payload.status,
        };
        const next =
          existing >= 0
            ? prev.map((a, i) => (i === existing ? optimistic : a))
            : [...prev, optimistic];
        qc.setQueryData<Attendance[]>(key, next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ATTENDANCE_VISIBLE_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_VISIBLE_KEY });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      // Pasar lista es justo lo que cambia el reporte (sesiones realizadas,
      // tasa de asistencia, alumnos en riesgo) y la bandeja de pendientes. Sin
      // esto, el ActionTray —que vive en la misma pantalla donde el profesor
      // acaba de pasar lista, así que no se vuelve a montar— seguía anunciando
      // como "pendiente de registrar" la clase que se acababa de registrar.
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      // Marcar a alguien es también la única señal de que la sesión se dio.
      qc.invalidateQueries({ queryKey: ["sessions"] });
      // La jornada muestra "x de y marcados" y la lista del día viene resuelta
      // del servidor: las dos quedan desfasadas tras cada marca sin esto.
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["class-board"] });
    },
  });
}

export function useBulkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      items,
    }: {
      sessionId: number;
      items: { enrollment_id: number; status: AttendanceStatus }[];
    }) =>
      (
        await api.post<BulkAttendanceResponse>(
          `/attendance/sessions/${sessionId}/bulk`,
          { items },
        )
      ).data,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_VISIBLE_KEY });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["class-board"] });
    },
  });
}

