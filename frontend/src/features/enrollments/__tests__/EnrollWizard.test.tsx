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

    vi.mocked(queries.useCreateUser).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99, full_name: "Nuevo Alumno", email: "nuevo@test.com" }),
      isPending: false,
    } as any);

    vi.mocked(queries.useEnrollments).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(queries.useSchedules).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  it("shows student and course on a single screen", () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    expect(screen.getByText("Inscribir Alumno al Curso")).toBeInTheDocument();
    expect(screen.getByText("Alumno")).toBeInTheDocument();
    expect(screen.getByText("Curso")).toBeInTheDocument();
  });

  it("keeps the submit button disabled until student and course are chosen", async () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    const submit = screen.getByRole("button", { name: /inscribir al curso/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /nuevo/i }));
    fireEvent.change(screen.getByPlaceholderText("Ej. María Fernanda López"), {
      target: { value: "Nuevo Alumno" },
    });
    fireEvent.change(screen.getByPlaceholderText("maria@ejemplo.com"), {
      target: { value: "nuevo@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/2540 12345 0101/i), {
      target: { value: "1234567890101" },
    });

    // Student is filled in but no course yet — still blocked.
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /buscar un curso/i }));
    fireEvent.click(await screen.findByRole("option", { name: /English A1/ }));

    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("preselects the course it is opened with", () => {
    render(<EnrollWizard initialCourseId={1} onClose={mockOnClose} />);

    expect(screen.getByText("English A1")).toBeInTheDocument();
    // The pinned footer reports the live capacity of the preselected course.
    expect(screen.getByText("20 cupos libres en English A1")).toBeInTheDocument();
  });

  it("should close wizard on cancel", () => {
    render(<EnrollWizard onClose={mockOnClose} />);

    const cancelButton = screen.getByRole("button", { name: /cancelar/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
