import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { EnrollmentLedger, Invoice, PaymentKind } from "../types";

export const useEnrollmentLedger = (enrollmentId?: number) =>
  useQuery({
    queryKey: ["ledger", enrollmentId ?? "none"],
    enabled: !!enrollmentId,
    queryFn: async () =>
      (await api.get<EnrollmentLedger>(`/enrollments/${enrollmentId}/ledger`)).data,
  });

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      enrollment_id: number;
      kind: PaymentKind;
      amount: number;
      method?: string;
      notes?: string;
    }) => (await api.post("/payments", payload)).data,
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["ledger", v.enrollment_id] }),
  });
}

export const useEnrollmentInvoices = (enrollmentId?: number) =>
  useQuery({
    queryKey: ["invoices", enrollmentId ?? "none"],
    enabled: !!enrollmentId,
    queryFn: async () =>
      (await api.get<Invoice[]>(`/enrollments/${enrollmentId}/invoices`)).data,
  });

export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: number) =>
      (await api.post<Invoice>(`/enrollments/${enrollmentId}/invoice`)).data,
    onSuccess: (_d, enrollmentId) =>
      qc.invalidateQueries({ queryKey: ["invoices", enrollmentId] }),
  });
}

export async function downloadInvoicePdf(id: number, code: string) {
  const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factura_${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
