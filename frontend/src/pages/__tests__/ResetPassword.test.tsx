import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../test/utils";
import userEvent from "@testing-library/user-event";
import ResetPassword from "../ResetPassword";
import * as api from "../../lib/api";
import { useNavigate, useSearchParams } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

describe("ResetPassword", () => {
  let mockNavigate: any;

  beforeEach(() => {
    mockNavigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it("shows warning when token is missing", () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(""), vi.fn()]);

    render(<ResetPassword />);

    expect(screen.getByRole("heading", { name: "Enlace incompleto o expirado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio de sesión" })).toBeInTheDocument();
  });

  it("renders reset password form when token is present", () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams("token=sample-reset-token"), vi.fn()]);

    render(<ResetPassword />);

    expect(screen.getByRole("heading", { name: "Restablecer contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar nueva contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restablecer y entrar" })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams("token=sample-reset-token"), vi.fn()]);
    const user = userEvent.setup();

    render(<ResetPassword />);

    const passwordInput = screen.getByPlaceholderText("Al menos 8 caracteres");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("submits password reset successfully and shows confirmation", async () => {
    const submitSpy = vi.spyOn(api, "submitPasswordReset").mockResolvedValue(undefined);
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams("token=valid-token-123"), vi.fn()]);
    const user = userEvent.setup();

    render(<ResetPassword />);

    const passwordInput = screen.getByPlaceholderText("Al menos 8 caracteres");
    const confirmInput = screen.getByPlaceholderText("Repite la contraseña");
    const submitBtn = screen.getByRole("button", { name: "Restablecer y entrar" });

    // Botón deshabilitado al inicio
    expect(submitBtn).toBeDisabled();

    // Escribir contraseñas válidas
    await user.type(passwordInput, "SecurePass123!");
    await user.type(confirmInput, "SecurePass123!");

    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith("valid-token-123", "SecurePass123!");
      expect(screen.getByText("¡Contraseña actualizada!")).toBeInTheDocument();
    });

    submitSpy.mockRestore();
  });

  it("shows error alert when submission fails", async () => {
    const submitSpy = vi.spyOn(api, "submitPasswordReset").mockRejectedValue({
      response: {
        data: {
          detail: "El token de recuperación ha expirado.",
        },
      },
    });
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams("token=expired-token"), vi.fn()]);
    const user = userEvent.setup();

    render(<ResetPassword />);

    await user.type(screen.getByPlaceholderText("Al menos 8 caracteres"), "SecurePass123!");
    await user.type(screen.getByPlaceholderText("Repite la contraseña"), "SecurePass123!");
    await user.click(screen.getByRole("button", { name: "Restablecer y entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("El token de recuperación ha expirado.");
    });

    submitSpy.mockRestore();
  });
});
