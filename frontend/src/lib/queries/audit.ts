import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import type { AuditLog } from "../types";

export const useAudit = (
  filters: { entity?: string; entity_id?: number; offset?: number; limit?: number } = {},
) =>
  useQuery({
    queryKey: ["audit", filters.entity ?? "all", filters.entity_id ?? "all", filters.offset ?? 0],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.entity) params.set("entity", filters.entity);
      if (filters.entity_id) params.set("entity_id", String(filters.entity_id));
      if (filters.offset) params.set("offset", String(filters.offset));
      if (filters.limit) params.set("limit", String(filters.limit));
      return (
        await api.get<{ items: AuditLog[]; total: number; offset: number; limit: number }>(
          `/audit?${params.toString()}`,
        )
      ).data;
    },
  });
