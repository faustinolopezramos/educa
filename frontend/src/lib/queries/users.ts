import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, setToken } from "../api";
import type { StudentKardexResponse, User, UserCreated } from "../types";

/** `PATCH /auth/me`: el perfil, más un par de tokens nuevo si cambió la contraseña. */
export interface SelfUpdateResult extends User {
  tokens: { access_token: string; refresh_token: string } | null;
}

/**
 * `enabled` lets a caller skip the request entirely rather than fire one it
 * knows will 403 — the directory answers only to `manage_teachers` and
 * `manage_students`, so an assistant holding neither should not be asking.
 */
export const useUsers = (role?: string, enabled = true) =>
  useQuery({
    queryKey: ["users", role ?? "all"],
    queryFn: async () => {
      const res = await api.get<{ items: User[] }>(
        role ? `/users?role=${role}` : "/users",
      );
      return res.data.items;
    },
    enabled,
  });

export const useStudentKardex = (studentId?: number, enabled = true) =>
  useQuery({
    queryKey: ["student-kardex", studentId],
    queryFn: async () => {
      const res = await api.get<StudentKardexResponse>(`/users/${studentId}/kardex`);
      return res.data;
    },
    enabled: enabled && !!studentId,
  });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    // Sin `password`, el servidor genera una y la devuelve en `generated_password`.
    mutationFn: async (payload: Partial<User> & { password?: string }) =>
      (await api.post<UserCreated>("/users", payload)).data,
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
  notify_email?: boolean;
  notify_whatsapp?: boolean;
  address?: string | null;
  cui_passport?: string | null;
  nationality_id?: number | null;
}

// Self-service profile edit: name/timezone/password for the logged-in user.
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) =>
      (await api.patch<SelfUpdateResult>("/auth/me", patch)).data,
    onSuccess: (result) => {
      // Cambiar la contraseña invalida todos los tokens anteriores, también los
      // de esta sesión: el servidor manda un par nuevo y hay que quedárselo, o
      // la siguiente petición acaba en el login.
      if (result.tokens) {
        setToken(result.tokens.access_token, result.tokens.refresh_token);
      }
      // Keeps the admin's own row in sync if it's showing in the users list.
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
