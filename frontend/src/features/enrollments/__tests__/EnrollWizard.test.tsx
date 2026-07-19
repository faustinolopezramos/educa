import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { EnrollWizard } from "../EnrollWizard";
import * as queries from "../../../lib/queries";

vi.mock("../../../lib/queries");

describe("EnrollWizard", () => {
  let mockOnClose: any;

  beforeEach(() => {
    mockOnClose = vi.fn();
    vi.mocked(queries.useCourses).mockReturnValue({
      data: [
        { id: 1, name: "English A1", level_id: 1, start_date: "2026-01-01", end_date: "2026-03-31", max_students: 20, passing_score: 6.0 },
      ],
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(queries.useUsers).mockReturnValue({
      data: [
        { id: 1, email: "student@educa.com", full_name: "Test Student", role: "student", timezone: "UTC" },
      ],
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(queries.useCreateEnrollment).mockReturnValue({
      mutate: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as any);
  });

  it("should render step 1: select course", () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    expect(screen.getByText("Matricular alumno")).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
  });

  it("should allow proceeding to step 2 after selecting course", async () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    const courseSelect = screen.getByRole("combobox");
    fireEvent.change(courseSelect, { target: { value: "1" } });

    const nextButton = screen.getByRole("button", { name: /siguiente|continuar/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    });
  });

  it("should close wizard on cancel", () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    const cancelButton = screen.getByRole("button", { name: /cancelar/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
