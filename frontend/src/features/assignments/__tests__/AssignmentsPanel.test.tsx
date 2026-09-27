import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { AssignmentsPanel } from "../AssignmentsPanel";
import { api } from "../../../lib/api";
import * as AuthContext from "../../../auth/AuthContext";
import { createUser } from "../../../test/fixtures";

vi.mock("../../../lib/api");

const mockTeacher = createUser({
  id: 1,
  email: "teacher@educa.com",
  full_name: "Profesor Juan Pérez",
  role: "teacher",
  permissions: ["manage_grades"],
});

const mockStudent = createUser({
  id: 2,
  email: "student@educa.com",
  full_name: "Sofia Valdés",
  role: "student",
  permissions: [],
});

const mockCourses = [
  { id: 10, name: "Inglés B2", language_id: 1, level_id: 1, is_active: true },
];

const mockAssignments = [
  {
    id: 101,
    course_id: 10,
    title: "Ensayo Argumentativo de IA",
    description: "Escribe 500 palabras sobre IA",
    resource_url: "https://example.com/guide.pdf",
    due_date: new Date(Date.now() + 86400000 * 2).toISOString(),
    created_at: new Date().toISOString(),
  },
];

const mockSubmissions = [
  {
    id: 201,
    assignment_id: 101,
    student_id: 2,
    content: "Mi ensayo sobre la IA",
    submission_url: "https://drive.google.com/test",
    submitted_at: new Date().toISOString(),
    status: "submitted" as const,
    score: null,
    feedback: null,
    is_late: false,
  },
];

const mockRoster = [
  {
    student_id: 2,
    full_name: "Sofia Valdés",
    status: "submitted" as const,
    submission_id: 201,
    submitted_at: new Date().toISOString(),
    content: "Mi ensayo sobre la IA",
    submission_url: "https://drive.google.com/test",
    score: null,
    feedback: null,
    is_late: false,
  },
];

describe("AssignmentsPanel (Minimalist & EdTech UX)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/catalog/courses") return { data: mockCourses } as never;
      if (url === "/assignments") return { data: mockAssignments } as never;
      if (url.includes("/submissions")) return { data: mockSubmissions } as never;
      if (url.includes("/roster-status")) return { data: mockRoster } as never;
      return { data: [] } as never;
    });
  });

  it("renders teacher dashboard with + Nueva Tarea button and SpeedGrader button", async () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: mockTeacher,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<AssignmentsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Tareas y Evaluaciones")).toBeInTheDocument();
      expect(screen.getByText("+ Nueva Tarea")).toBeInTheDocument();
      expect(screen.getByText("Ensayo Argumentativo de IA")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /SpeedGrader/ })).toBeInTheDocument();
    });
  });

  it("opens TeacherSpeedGrader modal when teacher clicks on SpeedGrader button", async () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: mockTeacher,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<AssignmentsPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /SpeedGrader/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /SpeedGrader/ }));

    await waitFor(() => {
      expect(screen.getByText("SpeedGrader · Revisión de Entregas")).toBeInTheDocument();
      expect(screen.getByText("Respuesta del Alumno")).toBeInTheDocument();
      expect(screen.getByText("Mi ensayo sobre la IA")).toBeInTheDocument();
      expect(screen.getByText("Guardar y Siguiente →")).toBeInTheDocument();
    });
  });

  it("renders student view with delivery status and opens StudentAssignmentModal", async () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: mockStudent,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<AssignmentsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Tareas y Evaluaciones")).toBeInTheDocument();
      expect(screen.getByText("Ver / Editar Entrega")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Ver / Editar Entrega"));

    await waitFor(() => {
      expect(screen.getByText("Detalle de tu Entrega")).toBeInTheDocument();
      expect(screen.getByText(/Comprobante de entrega registrado/)).toBeInTheDocument();
    });
  });
});
