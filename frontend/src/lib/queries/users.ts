import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { User } from "../types";
import { useList } from "./common";

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
