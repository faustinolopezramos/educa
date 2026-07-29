import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Tenant } from "../types";
import { useList } from "./common";

/** Superadmin-only: the academies this installation serves. */
export const useTenants = () => useList<Tenant>(["tenants"], "/tenants");

export interface TenantPayload {
  name: string;
  slug: string;
  logo_url?: string | null;
  is_active?: boolean;
  max_active_students?: number;
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TenantPayload) =>
      (await api.post<Tenant>("/tenants", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<TenantPayload> & { id: number }) =>
      (await api.patch<Tenant>(`/tenants/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
