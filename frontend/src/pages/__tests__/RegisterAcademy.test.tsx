import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../test/utils";
import RegisterAcademy from "../RegisterAcademy";
import * as AuthContext from "../../auth/AuthContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams("plan=pro")],
  };
});

describe("RegisterAcademy", () => {
  const mockRegisterAcademy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      registerAcademy: mockRegisterAcademy,
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    });
  });

  it("renders form elements and preselects plan from URL search params", () => {
    render(<RegisterAcademy />);

    expect(screen.getByText("Crea tu Academia en 1 Minuto")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ej. Instituto Moderno de Idiomas")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("instituto-moderno")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ej. Lic. Carlos Valdés")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("direccion@tuacademia.com")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Mínimo 8 caracteres")
    ).toBeInTheDocument();
  });

  it("auto-generates slug based on academy name input", async () => {
    render(<RegisterAcademy />);

    const nameInput = screen.getByPlaceholderText(
      "Ej. Instituto Moderno de Idiomas"
    );
    fireEvent.change(nameInput, {
      target: { value: "Academia Éxito Total" },
    });

    await waitFor(() => {
      expect(screen.getByText("academia-exito-total.educa.com")).toBeInTheDocument();
    });
  });

  it("submits valid form data and navigates to root dashboard", async () => {
    mockRegisterAcademy.mockResolvedValueOnce({
      id: 1,
      email: "director@exito.com",
      full_name: "Director Juan",
      role: "admin",
    });

    render(<RegisterAcademy />);

    fireEvent.change(
      screen.getByPlaceholderText("Ej. Instituto Moderno de Idiomas"),
      { target: { value: "Academia Exito" } }
    );
    fireEvent.change(screen.getByPlaceholderText("instituto-moderno"), {
      target: { value: "exito" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ej. Lic. Carlos Valdés"), {
      target: { value: "Juan Perez" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("direccion@tuacademia.com"),
      { target: { value: "director@exito.com" } }
    );
    fireEvent.change(screen.getByPlaceholderText("Mínimo 8 caracteres"), {
      target: { value: "secret1234" },
    });
    // El director elige en qué moneda cobra su academia.
    expect(screen.getByLabelText("Moneda de tu academia")).toHaveValue("GTQ");
    fireEvent.change(screen.getByLabelText("Moneda de tu academia"), {
      target: { value: "USD" },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /acepto/i }));
    const submitBtn = screen.getByRole("button", {
      name: /Crear Academia y Solicitar Plan/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRegisterAcademy).toHaveBeenCalledWith({
        academy_name: "Academia Exito",
        slug: "exito",
        admin_name: "Juan Perez",
        admin_email: "director@exito.com",
        password: "secret1234",
        phone: undefined,
        plan_tier: "pro",
        currency: "USD",
        accept_terms: true,
      });
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("displays server error message on duplicate slug conflict", async () => {
    mockRegisterAcademy.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: "El subdominio ya está registrado. Por favor elige otro." },
      },
    });

    render(<RegisterAcademy />);

    fireEvent.change(
      screen.getByPlaceholderText("Ej. Instituto Moderno de Idiomas"),
      { target: { value: "Academia Exito" } }
    );
    fireEvent.change(screen.getByPlaceholderText("instituto-moderno"), {
      target: { value: "exito" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ej. Lic. Carlos Valdés"), {
      target: { value: "Juan Perez" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("direccion@tuacademia.com"),
      { target: { value: "director@exito.com" } }
    );
    fireEvent.change(screen.getByPlaceholderText("Mínimo 8 caracteres"), {
      target: { value: "secret1234" },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /acepto/i }));
    const submitBtn = screen.getByRole("button", {
      name: /Crear Academia y Solicitar Plan/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("El subdominio ya está registrado. Por favor elige otro.")
      ).toBeInTheDocument();
    });
  });

  it("allows choosing the Free plan for small academies with up to 15 students", async () => {
    mockRegisterAcademy.mockResolvedValueOnce({
      id: 2,
      email: "tutor@libre.com",
      full_name: "Prof. Elena",
      role: "admin",
    });

    render(<RegisterAcademy />);

    // Click the Gratis plan button
    const freePlanBtn = screen.getByRole("button", { name: /Hasta 15 alm/i });
    fireEvent.click(freePlanBtn);

    expect(
      screen.getByText(/Plan gratuito para siempre para hasta 15 alumnos/i)
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("Ej. Instituto Moderno de Idiomas"),
      { target: { value: "Tutorias Elena" } }
    );
    fireEvent.change(screen.getByPlaceholderText("instituto-moderno"), {
      target: { value: "tutorias-elena" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ej. Lic. Carlos Valdés"), {
      target: { value: "Elena Gomez" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("direccion@tuacademia.com"),
      { target: { value: "tutor@libre.com" } }
    );
    fireEvent.change(screen.getByPlaceholderText("Mínimo 8 caracteres"), {
      target: { value: "clave12345" },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /acepto/i }));
    const submitBtn = screen.getByRole("button", {
      name: /Crear Academia Gratis \(Hasta 15 Alumnos\)/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRegisterAcademy).toHaveBeenCalledWith({
        academy_name: "Tutorias Elena",
        slug: "tutorias-elena",
        admin_name: "Elena Gomez",
        admin_email: "tutor@libre.com",
        password: "clave12345",
        phone: undefined,
        plan_tier: "free",
        currency: "GTQ",
        accept_terms: true,
      });
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("does not create the academy until the terms are accepted", async () => {
    render(<RegisterAcademy />);
    fireEvent.change(screen.getByPlaceholderText("Ej. Instituto Moderno de Idiomas"), {
      target: { value: "Academia Exito" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ej. Lic. Carlos Valdés"), {
      target: { value: "Juan Perez" },
    });
    fireEvent.change(screen.getByPlaceholderText("direccion@tuacademia.com"), {
      target: { value: "director@exito.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mínimo 8 caracteres"), {
      target: { value: "secret1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear Academia y Solicitar Plan/i }));

    expect(await screen.findByText(/debes aceptar los Términos/)).toBeInTheDocument();
    expect(mockRegisterAcademy).not.toHaveBeenCalled();
    // Los documentos se abren aparte, sin perder lo escrito.
    expect(screen.getByRole("link", { name: "Términos y Condiciones" })).toHaveAttribute("target", "_blank");
  });

  it("displays recognition banner when typing a Google or Outlook email", async () => {
    render(<RegisterAcademy />);
    const emailInput = screen.getByPlaceholderText("direccion@tuacademia.com");

    fireEvent.change(emailInput, { target: { value: "director@gmail.com" } });
    await waitFor(() => {
      expect(screen.getByText("Cuenta de Google detectada")).toBeInTheDocument();
    });

    fireEvent.change(emailInput, { target: { value: "rector@outlook.com" } });
    await waitFor(() => {
      expect(screen.getByText("Cuenta de Microsoft / Outlook detectada")).toBeInTheDocument();
    });
  });

  it("generates a secure password and toggles visibility", async () => {
    render(<RegisterAcademy />);
    const passwordInput = screen.getByPlaceholderText("Mínimo 8 caracteres");
    expect(passwordInput).toHaveAttribute("type", "password");

    const suggestBtn = screen.getByRole("button", { name: /Sugerir contraseña segura/i });
    fireEvent.click(suggestBtn);

    expect((passwordInput as HTMLInputElement).value.length).toBeGreaterThanOrEqual(8);
    expect(passwordInput).toHaveAttribute("type", "text");

    const toggleBtn = screen.getByRole("button", { name: /Ocultar contraseña/i });
    fireEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
