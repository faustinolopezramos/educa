import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentReceiptModal } from "../PaymentReceiptModal";

// Mock AuthContext
vi.mock("../../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, full_name: "Secretaría General", role: "assistant" },
  }),
}));

describe("PaymentReceiptModal", () => {
  const receipt = {
    receiptNumber: "9912",
    studentName: "Juan Pérez",
    studentEmail: "juan@example.com",
    studentPhone: "55551234",
    studentCui: "1234567890101",
    courseName: "Inglés Intensivo A2",
    enrollmentCode: "ENR-0012",
    amount: 350,
    method: "cash",
    notes: "Boleta #441",
    date: "2026-10-08T12:00:00Z",
    previousBalance: 500,
    remainingBalance: 150,
  };

  it("renders student information, payment amount, and voucher folio", () => {
    const onClose = vi.fn();
    render(<PaymentReceiptModal receipt={receipt} onClose={onClose} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Inglés Intensivo A2")).toBeInTheDocument();
    expect(screen.getAllByText(/REC-09912/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Total Recibido/)).toBeInTheDocument();
    expect(screen.getAllByText(/Q350\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("triggers window.print when clicking print button", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PaymentReceiptModal receipt={receipt} onClose={() => {}} />);

    const printButton = screen.getByRole("button", { name: /Imprimir Recibo/i });
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
