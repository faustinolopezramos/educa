import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { StudentBulkImportModal } from "../StudentBulkImportModal";
import { api } from "../../../lib/api";
import * as queries from "../../../lib/queries";

vi.mock("../../../lib/api");
vi.mock("../../../lib/queries");

describe("StudentBulkImportModal (Priority P1)", () => {
  const mockCourses = [
    { id: 1, name: "Inglés A1", language_id: 1, level_id: 1, is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queries.useCourses).mockReturnValue({ data: mockCourses } as never);
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => "blob:test");
    } else {
      vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:test");
    }
    // jsdom no lo implementa.
    window.URL.revokeObjectURL = vi.fn();
  });

  it("renders modal with template download and upload dropzone", () => {
    render(<StudentBulkImportModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText("Carga Masiva de Alumnos (CSV / Excel)")).toBeInTheDocument();
    expect(screen.getByText("📄 Descargar plantilla CSV")).toBeInTheDocument();
    expect(screen.getByText(/Arrastra tu archivo CSV aquí/)).toBeInTheDocument();
  });

  it("triggers CSV template download when clicking download button", () => {
    render(<StudentBulkImportModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    const downloadBtn = screen.getByText("📄 Descargar plantilla CSV");
    fireEvent.click(downloadBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("processes bulk import submission and displays results step", async () => {
    const mockResponse = {
      total_processed: 2,
      created_count: 2,
      enrolled_count: 2,
      skipped_count: 0,
      error_count: 0,
      results: [
        {
          row_number: 1,
          full_name: "Juan Perez",
          email: "juan@example.com",
          status: "created",
          user_id: 101,
          enrolled_course_id: 1,
          message: "Estudiante creado exitosamente y matriculado",
        },
        {
          row_number: 2,
          full_name: "Maria Lopez",
          email: "maria@example.com",
          status: "created",
          user_id: 102,
          enrolled_course_id: 1,
          message: "Estudiante creado exitosamente y matriculado",
        },
      ],
    };

    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });
    const onSuccess = vi.fn();

    render(<StudentBulkImportModal onClose={vi.fn()} onSuccess={onSuccess} />);

    // Simulate file input
    const csvContent = "Nombre Completo,Correo Electronico\nJuan Perez,juan@example.com\nMaria Lopez,maria@example.com";
    const file = new File([csvContent], "alumnos.csv", { type: "text/csv" });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    Object.defineProperty(input, "files", {
      value: [file],
    });

    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/Vista Previa \(2 alumnos detectados\)/)).toBeInTheDocument();
      expect(screen.getByText("Juan Perez")).toBeInTheDocument();
      expect(screen.getByText("Maria Lopez")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /Importar 2 Alumnos/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/users/bulk-import",
        expect.objectContaining({
          students: expect.arrayContaining([
            expect.objectContaining({ full_name: "Juan Perez", email: "juan@example.com" }),
          ]),
        })
      );
      expect(screen.getByText("Total Leídos")).toBeInTheDocument();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows each generated password and offers them as a download", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        total_processed: 1,
        created_count: 1,
        enrolled_count: 0,
        skipped_count: 0,
        error_count: 0,
        results: [
          {
            row_number: 1,
            full_name: "Juan Perez",
            email: "juan@example.com",
            status: "created",
            user_id: 101,
            message: "Estudiante creado exitosamente",
            generated_password: "k3Y-generada9",
          },
        ],
      },
    });

    render(<StudentBulkImportModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    const file = new File(["Nombre Completo,Correo Electronico\nJuan Perez,juan@example.com"], "a.csv", {
      type: "text/csv",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => screen.getByRole("button", { name: /Importar 1 Alumno/ }));
    fireEvent.click(screen.getByRole("button", { name: /Importar 1 Alumno/ }));

    await waitFor(() => expect(screen.getByText("k3Y-generada9")).toBeInTheDocument());
    // Ya no se manda una contraseña común para todos.
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty("default_password");

    fireEvent.click(screen.getByRole("button", { name: "Descargar credenciales (CSV)" }));
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });
});
