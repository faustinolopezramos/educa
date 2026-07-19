import { useQuery } from "@tanstack/react-query";

import { api } from "../api";

export function useList<T>(key: (string | number)[], url: string, enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<T[]>(url)).data,
    enabled,
  });
}
