import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Tenant, User } from "../types";
import { useList } from "./common";

/** Superadmin-only: the academies this installation serves. */
export const useTenants = () => useList<Tenant>(["tenants"], "/tenants");

export interface TenantPayload {
  name: string;
  slug: string;
  is_active?: boolean;
  max_active_students?: number;
  timezone?: string;
  /** Moneda en que la academia cobra a sus alumnos (ISO 4217). */
  currency?: string;
  phone?: string | null;
  tax_id?: string | null;
  address?: string | null;
}

/** Superadmin-only: the admins of one academy. */
export const useTenantAdmins = (tenantId: number) =>
  useList<User>(["tenants", tenantId, "admins"], `/tenants/${tenantId}/admins`);

/** An academy's admin, created by the platform owner inside that academy. */
export function useCreateTenantAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tenant_id: number;
      full_name: string;
      email: string;
      cui_passport: string;
      password: string;
      timezone: string;
    }) => (await api.post<User>("/users", { ...payload, role: "admin" })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
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

/** Superadmin: poner a una academia en un plan (normalmente el que pidió). */
export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, plan }: { tenantId: number; plan: string }) =>
      (await api.post<Tenant>(`/tenants/${tenantId}/plan`, { plan })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

/** Superadmin: rechazar la solicitud de plan de una academia. */
export function useRejectPlanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, reason }: { tenantId: number; reason?: string }) =>
      (await api.post<Tenant>(`/tenants/${tenantId}/plan-request/reject`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
