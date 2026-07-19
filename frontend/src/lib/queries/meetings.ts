import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { VirtualMeeting } from "../types";
import { useList } from "./common";

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
