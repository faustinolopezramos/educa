import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../test/utils";
import userEvent from "@testing-library/user-event";
import Login from "../Login";
import * as AuthContext from "../../auth/AuthContext";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("../../auth/AuthContext");

describe("Login", () => {
  let mockNavigate: any;
  let mockLogin: any;

  beforeEach(() => {
    mockNavigate = vi.fn();
    mockLogin = vi.fn();

    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: mockLogin,
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });
  });

  it("should render login form", () => {
    render(<Login />);

    expect(screen.getByText("Educa")).toBeInTheDocument();
    expect(screen.getByText("Control Académico y Aula Virtual")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("admin@educa.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("should show validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("admin@educa.com");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "invalid");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Correo inválido")).toBeInTheDocument();
    });
  });

  it("should show validation error for empty password", async () => {
    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("admin@educa.com");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "admin@educa.com");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Requerido")).toBeInTheDocument();
    });
  });

  it("should submit login with valid credentials", async () => {
    mockLogin.mockResolvedValueOnce({ id: 1, email: "admin@educa.com" });

    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("admin@educa.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "admin@educa.com");
    await user.type(passwordInput, "admin123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin@educa.com", "admin123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("should show error message on login failure", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("admin@educa.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "admin@educa.com");
    await user.type(passwordInput, "wrong");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Credenciales incorrectas")).toBeInTheDocument();
    });
  });

  it("should disable submit button while submitting", async () => {
    mockLogin.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("admin@educa.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "admin@educa.com");
    await user.type(passwordInput, "admin123");
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();

    await waitFor(
      () => {
        expect(submitButton).not.toBeDisabled();
      },
      { timeout: 2000 },
    );
  });
});
