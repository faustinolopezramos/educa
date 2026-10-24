import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../test/utils";
import { Layout } from "../Layout";
import * as AuthContext from "../../auth/AuthContext";
import { createUser } from "../../test/fixtures";

vi.mock("../../lib/queries", async () => {
  const actual = await vi.importActual("../../lib/queries");
  return {
    ...actual,
    useLocationProposals: () => ({ data: [] }),
    useDashboard: () => ({
      data: {
        summary: { total_students: 1, total_teachers: 1, attendance_rate: 1 },
        items: [{ kind: "pending_assignments", count: 2, severity: "warning" }],
      },
    }),
    useNotifications: () => ({ data: [] }),
    useUnreadCount: () => ({ data: 0 }),
    useUsers: () => ({ data: [] }),
    useCourses: () => ({ data: [] }),
    useEnrollments: () => ({ data: [] }),
    useAssignments: () => ({ data: [] }),
    useSchedules: () => ({ data: [] }),
  };
});

describe("Layout - Student Navigation", () => {
  it("renders mobile bottom navigation bar when logged in as student", () => {
    const studentUser = createUser({
      id: 5,
      full_name: "María Gómez",
      role: "student",
      email: "maria@educa.com",
    });

    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: studentUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<Layout />);

    const bottomNav = screen.getByLabelText("Navegación móvil del estudiante");
    expect(bottomNav).toBeInTheDocument();
    expect(screen.getAllByText("Mi semana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tareas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mi progreso").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Perfil").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument(); // pending tasks badge
  });

  it("renders mobile bottom navigation bar when logged in as teacher", () => {
    const teacherUser = createUser({
      id: 3,
      full_name: "Profesor Juan",
      role: "teacher",
      email: "juan@educa.com",
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

    render(<Layout />);

    const bottomNav = screen.getByLabelText("Navegación móvil del profesor");
    expect(bottomNav).toBeInTheDocument();
    expect(screen.getAllByText("Hoy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clases").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tareas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nómina").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Perfil").length).toBeGreaterThan(0);
  });
});
