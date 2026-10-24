import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../test/utils";
import { CommandPalette } from "../CommandPalette";
import * as AuthContext from "../../auth/AuthContext";
import { createUser } from "../../test/fixtures";

vi.mock("../../lib/queries", async () => {
  const actual = await vi.importActual("../../lib/queries");
  return {
    ...actual,
    useUsers: (role?: string) => {
      if (role === "teacher") {
        return {
          data: [
            {
              id: 4,
              full_name: "Profesor Martín",
              email: "martin@educa.com",
              role: "teacher",
            },
          ],
        };
      }
      if (role === "student") {
        return {
          data: [
            {
              id: 5,
              full_name: "Estudiante Carlos",
              email: "carlos@educa.com",
              role: "student",
            },
          ],
        };
      }
      return { data: [] };
    },
    useCourses: () => ({
      data: [{ id: 10, name: "Matemáticas Avanzadas", is_active: true }],
    }),
    useEnrollments: () => ({
      data: [
        {
          id: 101,
          student_id: 5,
          course_id: 10,
          enrollment_code: "MAT-2026-999",
          status: "active",
        },
      ],
    }),
    useAssignments: () => ({
      data: [
        {
          id: 50,
          course_id: 10,
          title: "Tarea de Cálculo",
          due_date: "2026-10-31T23:59:00Z",
        },
      ],
    }),
    useSchedules: () => ({
      data: [
        {
          id: 1,
          course_id: 10,
          teacher_id: 3,
          day_of_week: 1,
          start_time: "08:00:00",
          end_time: "10:00:00",
        },
      ],
    }),
  };
});

describe("CommandPalette - Teacher Experience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows teacher-specific quick actions when opened", () => {
    const teacherUser = createUser({
      id: 3,
      full_name: "Profesor Roberto",
      role: "teacher",
      email: "roberto@educa.com",
    });

    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: teacherUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByPlaceholderText(/Buscar sección, tus cursos o tareas/i)).toBeInTheDocument();
    expect(screen.getByText("📅 Mi Jornada de Hoy")).toBeInTheDocument();
    expect(screen.getByText("📚 Mis Clases y Asistencia")).toBeInTheDocument();
    expect(screen.getByText("📝 Calificar Tareas y Entregas")).toBeInTheDocument();
    expect(screen.getByText("💰 Mi Nómina y Liquidación")).toBeInTheDocument();
  });

  it("filters courses and tasks taught by teacher when typing search query", () => {
    const teacherUser = createUser({
      id: 3,
      full_name: "Profesor Roberto",
      role: "teacher",
      email: "roberto@educa.com",
    });

    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: teacherUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const input = screen.getByPlaceholderText(/Buscar sección, tus cursos o tareas/i);
    fireEvent.change(input, { target: { value: "cálculo" } });

    expect(screen.getByText("📝 Tarea: Tarea de Cálculo")).toBeInTheDocument();
  });
});

describe("CommandPalette - Admin Experience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows staff quick action for importing students from CSV", () => {
    const adminUser = createUser({
      id: 1,
      full_name: "Administrador General",
      role: "admin",
      email: "admin@educa.com",
    });

    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: adminUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByText("📥 Importar alumnos desde CSV / Excel")).toBeInTheDocument();
  });

  it("finds teachers and enrollment codes when typing in spotlight search", () => {
    const adminUser = createUser({
      id: 1,
      full_name: "Administrador General",
      role: "admin",
      email: "admin@educa.com",
    });

    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: adminUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const input = screen.getByPlaceholderText(/Buscar sección, alumno o curso/i);

    // Search for teacher
    fireEvent.change(input, { target: { value: "Martín" } });
    expect(screen.getByText("👨‍🏫 Profesor: Profesor Martín")).toBeInTheDocument();

    // Search for enrollment code
    fireEvent.change(input, { target: { value: "MAT-2026" } });
    expect(screen.getByText("📋 Matrícula: MAT-2026-999")).toBeInTheDocument();
  });
});
