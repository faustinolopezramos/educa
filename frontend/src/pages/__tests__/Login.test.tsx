import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../test/utils";
import userEvent from "@testing-library/user-event";
import Login from "../Login";
import * as AuthContext from "../../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import * as supabase from "../../lib/supabase";
import * as api from "../../lib/api";

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

    expect(screen.getByRole("heading", { name: "Inicia sesión en Educa" })).toBeInTheDocument();
    // Las etiquetas nombran a sus campos.
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("tu@correo.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("should show validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("tu@correo.com");
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

    const emailInput = screen.getByPlaceholderText("tu@correo.com");
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

    const emailInput = screen.getByPlaceholderText("tu@correo.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitButton = screen.getByRole("button", { name: "Entrar" });

    await user.type(emailInput, "admin@educa.com");
    await user.type(passwordInput, "admin123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin@educa.com", "admin123", undefined);
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  async function submitWith(error: unknown) {
    mockLogin.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByPlaceholderText("tu@correo.com"), "admin@educa.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
  }

  it("says the credentials are wrong in Spanish, not the API's English", async () => {
    await submitWith({
      response: { status: 401, data: { detail: "Could not validate credentials" } },
    });
    await waitFor(() => {
      expect(screen.getByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Could not validate/)).not.toBeInTheDocument();
  });

  it("explains that the academy is suspended", async () => {
    await submitWith({
      response: {
        status: 403,
        data: { detail: "Tu academia está suspendida en la plataforma." },
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/academia está suspendida/)).toBeInTheDocument();
    });
  });

  it("says plainly when the email has no account in any academy", async () => {
    await submitWith({
      response: {
        status: 403,
        data: {
          detail: {
            code: "no_account",
            message: "El correo admin@educa.com no tiene cuenta en EDUCA.",
          },
        },
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("no tiene cuenta en EDUCA");
    });
  });

  it("keeps the promotion out of the login: only access and a way back", () => {
    render(<Login />);
    expect(screen.queryByText(/Crea tu academia/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a la portada/ })).toHaveAttribute("href", "/");
  });

  it("shows no provider buttons when none is configured", () => {
    render(<Login />);
    expect(screen.queryByText(/Continuar con/)).not.toBeInTheDocument();
  });

  it("does not blame the password when the server could not be reached", async () => {
    await submitWith(new Error("Network Error"));
    await waitFor(() => {
      expect(screen.getByText(/No se pudo iniciar sesión/)).toBeInTheDocument();
    });
  });

  it("should disable submit button while submitting", async () => {
    mockLogin.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByPlaceholderText("tu@correo.com");
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

  it("prefills saved email from localStorage", () => {
    localStorage.setItem("educa_saved_email", "recordado@ejemplo.com");
    try {
      render(<Login />);
      expect(screen.getByPlaceholderText("tu@correo.com")).toHaveValue("recordado@ejemplo.com");
      expect(screen.getByLabelText("Recordar mi correo")).toBeChecked();
    } finally {
      localStorage.removeItem("educa_saved_email");
    }
  });

  it("sends magic link when requested and shows confirmation message", async () => {
    const sendMagicLinkSpy = vi.spyOn(supabase, "sendMagicLink").mockResolvedValue();
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByPlaceholderText("tu@correo.com"), "profesor@colegio.edu");
    const magicLinkBtn = screen.getByRole("button", {
      name: /Enviar enlace al correo/i,
    });
    await user.click(magicLinkBtn);

    await waitFor(() => {
      expect(sendMagicLinkSpy).toHaveBeenCalledWith("profesor@colegio.edu", {
        tenantSlug: undefined,
        returnTo: "/",
      });
      expect(screen.getByText("¡Enlace de acceso enviado!")).toBeInTheDocument();
    });
    sendMagicLinkSpy.mockRestore();
  });

  it("toggles password visibility between password and text type", async () => {
    const user = userEvent.setup();
    render(<Login />);
    const passwordInput = screen.getByPlaceholderText("••••••••");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("switches to forgot password mode and submits recovery request", async () => {
    const requestResetSpy = vi.spyOn(api, "requestPasswordReset").mockResolvedValue("Se ha enviado un enlace");
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByPlaceholderText("tu@correo.com"), "usuario@educa.com");
    const forgotBtn = screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" });
    await user.click(forgotBtn);

    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: "Enviar enlace de recuperación" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(requestResetSpy).toHaveBeenCalledWith("usuario@educa.com", undefined);
      expect(screen.getByText("¡Solicitud recibida!")).toBeInTheDocument();
    });

    const backBtn = screen.getByRole("button", { name: "Volver a iniciar sesión" });
    await user.click(backBtn);
    expect(screen.getByRole("heading", { name: "Inicia sesión en Educa" })).toBeInTheDocument();

    requestResetSpy.mockRestore();
  });

  it("shows distinct lockout banner on rate limit / 429 response", async () => {
    await submitWith({
      response: {
        status: 429,
        data: { detail: { message: "Demasiados intentos. Espera un minuto." } },
      },
    });
    await waitFor(() => {
      expect(screen.getByText("Acceso protegido temporalmente")).toBeInTheDocument();
      expect(screen.getByText(/Demasiados intentos/)).toBeInTheDocument();
      expect(screen.getByText(/¿Olvidaste tu contraseña\? Restablécela aquí/)).toBeInTheDocument();
    });
  });
});
