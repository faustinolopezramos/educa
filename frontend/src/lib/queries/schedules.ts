import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { AvailableTeacher, ConflictResponse, Schedule } from "../types";
import { useList } from "./common";

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

export const usePublicTeachers = () =>
  useList<AvailableTeacher>(["public-teachers"], "/teachers");

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
