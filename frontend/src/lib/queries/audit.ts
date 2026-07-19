import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { AuditLog } from "../types";

export const useAudit = (filters: { entity?: string; entity_id?: number } = {}) =>
  useQuery({
    queryKey: ["audit", filters.entity ?? "all", filters.entity_id ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.entity) params.set("entity", filters.entity);
      if (filters.entity_id) params.set("entity_id", String(filters.entity_id));
      return (await api.get<AuditLog[]>(`/audit?${params.toString()}`)).data;
    },
  });
