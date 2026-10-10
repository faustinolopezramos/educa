import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test/utils";
import { StudentPaymentsView } from "../StudentPaymentsView";
import * as queries from "../../../lib/queries";
import type { Enrollment, EnrollmentLedger, Invoice } from "../../../lib/types";

vi.mock("../../../lib/queries");
vi.mock("../../../lib/useMoney", async () => {
  const { formatMoney } = await import("../../../lib/currency");
  return {
    useMoney: () => ({
      currency: "GTQ",
      symbol: "Q",
      money: (n: number) => formatMoney(n, "GTQ"),
    }),
  };
});

const mockEnrollments: Enrollment[] = [
  {
    id: 10,
    student_id: 1,
    course_id: 101,
    enrollment_code: "MAT-101",
    status: "active",
    payment_status: "paid",
    attendance_blocked: false,
    amount: 350,
    balance: 0,
  },
];

const mockLedger: EnrollmentLedger = {
  enrollment_id: 10,
  charged: 350,
  paid: 350,
  balance: 0,
  movements: [
    {
      id: 1,
      enrollment_id: 10,
      kind: "charge",
      amount: 350,
      method: null,
      due_date: "2026-10-01",
      paid_at: "2026-10-01T10:00:00Z",
      recorded_by: 1,
      notes: "Mensualidad Octubre",
    },
    {
      id: 2,
      enrollment_id: 10,
      kind: "payment",
      amount: 350,
      method: "Transferencia",
      receipt_number: "REC-999",
      due_date: null,
      paid_at: "2026-10-02T12:00:00Z",
      recorded_by: 1,
      notes: "Pago colegiatura",
    },
  ],
};

const mockInvoices: Invoice[] = [
  {
    id: 55,
    enrollment_id: 10,
    code: "FAC-001",
    total_amount: 350,
    issued_at: "2026-10-02T12:05:00Z",
    issued_by: 1,
  },
];

describe("StudentPaymentsView", () => {
  beforeEach(() => {
    vi.mocked(queries.useEnrollments).mockReturnValue({
      data: mockEnrollments,
      isLoading: false,
    } as any);
    vi.mocked(queries.useCourses).mockReturnValue({
      data: [{ id: 101, name: "Inglés Avanzado B2" }],
    } as any);
    vi.mocked(queries.useEnrollmentLedger).mockReturnValue({
      data: mockLedger,
      isLoading: false,
    } as any);
    vi.mocked(queries.useEnrollmentInvoices).mockReturnValue({
      data: mockInvoices,
      isLoading: false,
    } as any);
  });

  it("renders student financial summary and solvency badge", () => {
    render(<StudentPaymentsView />);

    expect(screen.getByText("MAT-101")).toBeInTheDocument();
    expect(screen.getByText("Inglés Avanzado B2")).toBeInTheDocument();
    expect(screen.getByText("✓ Solvente / Pagos al día")).toBeInTheDocument();
    expect(screen.getByText("Movimientos y Pagos Registrados")).toBeInTheDocument();
  });

  it("displays movements list with payments and charges", () => {
    render(<StudentPaymentsView />);

    expect(screen.getByText("Mensualidad Octubre")).toBeInTheDocument();
    expect(screen.getByText("Pago colegiatura")).toBeInTheDocument();
    expect(screen.getByText("Transferencia · Recibo #REC-999")).toBeInTheDocument();
  });

  it("displays official invoices with download action", () => {
    render(<StudentPaymentsView />);

    expect(screen.getByText("Factura #FAC-001")).toBeInTheDocument();
    expect(screen.getByText("Descargar PDF")).toBeInTheDocument();
  });
});
