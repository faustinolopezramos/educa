import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { User } from "../types";

export const useUsers = (role?: string) =>
  useQuery({
    queryKey: ["users", role ?? "all"],
    queryFn: async () => {
      const res = await api.get<{ items: User[] }>(
        role ? `/users?role=${role}` : "/users",
      );
      return res.data.items;
    },
  });

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

export interface ProfilePatch {
  full_name?: string;
  timezone?: string;
  password?: string;
  current_password?: string;
  phone?: string | null;
  address?: string | null;
  nationality_id?: number | null;
}

// Self-service profile edit: name/timezone/password for the logged-in user.
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => (await api.patch<User>("/auth/me", patch)).data,
    // Keeps the admin's own row in sync if it's showing in the users list.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
