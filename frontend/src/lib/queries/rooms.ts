import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Room } from "../types";
import { useList } from "./common";

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
