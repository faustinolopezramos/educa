import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test/utils";
import { CourseCatalog } from "../CourseCatalog";
import * as queries from "../../../lib/queries";

vi.mock("../../../lib/queries");

describe("CourseCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(queries.useCourses).mockReturnValue({
      data: [
        {
          id: 1,
          level_id: 10,
          name: "Inglés Básico A1",
          periodicity: "mensual",
          status: "in_progress",
          seats_taken: 5,
          max_students: 20,
          start_date: "2026-01-01",
          end_date: "2026-03-01",
        },
      ],
      isLoading: false,
    } as any);

    vi.mocked(queries.useLanguages).mockReturnValue({
      data: [
        { id: 100, name: "Inglés", kind: "language" },
        { id: 101, name: "Marketing Digital", kind: "digital_skill" },
      ],
      isLoading: false,
    } as any);

    vi.mocked(queries.useLevels).mockReturnValue({
      data: [
        { id: 10, language_id: 100, code: "A1", name: "Principiante" },
      ],
      isLoading: false,
    } as any);

    vi.mocked(queries.useSchedules).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    vi.mocked(queries.useUsers).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
  });

  it("renders grouped course catalog sections by Área Académica", () => {
    render(<CourseCatalog />);
    expect(screen.getByText(/Catálogo de Cursos por Área Académica/i)).toBeInTheDocument();
    expect(screen.getByText(/Área Académica: Inglés/i)).toBeInTheDocument();
    expect(screen.getByText(/Inglés Básico A1/i)).toBeInTheDocument();
  });
});
