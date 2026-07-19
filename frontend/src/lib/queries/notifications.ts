import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Notification } from "../types";

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<Notification[]>("/notifications")).data,
    refetchInterval: 60_000,
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () =>
      (await api.get<{ count: number }>("/notifications/unread-count")).data.count,
    refetchInterval: 60_000,
  });

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
