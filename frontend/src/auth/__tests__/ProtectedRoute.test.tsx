import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../test/utils";
import { ProtectedRoute } from "../ProtectedRoute";
import * as AuthContext from "../AuthContext";
import { Navigate } from "react-router-dom";

vi.mock("../AuthContext");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Navigate: vi.fn(() => <div>Redirecting...</div>),
  };
});

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render children when user is authenticated and loading is false", () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: { id: 1, email: "user@educa.com", role: "student", full_name: "Test", timezone: "UTC" },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("should show loading state when loading is true", () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      loading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("should redirect to login when user is not authenticated", () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(vi.mocked(Navigate)).toHaveBeenCalled();
  });
});
