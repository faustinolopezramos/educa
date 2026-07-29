import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test/utils";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "../ProfilePanel";
import * as AuthContext from "../../../auth/AuthContext";
import * as queries from "../../../lib/queries";
import * as toast from "../../../lib/toast";
import { createUser } from "../../../test/fixtures";

vi.mock("../../../auth/AuthContext");
vi.mock("../../../lib/queries");
vi.mock("../../../lib/toast");

describe("ProfilePanel", () => {
  const currentUser = createUser({
    full_name: "Ada Lovelace",
    timezone: "UTC",
    role: "teacher",
  });
  let mockUpdateUser: any;
  let mockMutate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser = vi.fn();
    mockMutate = vi.fn();

    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: currentUser,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
      updateUser: mockUpdateUser,
    });

    vi.mocked(queries.useUpdateMe).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    vi.mocked(queries.useNationalities).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  it("renders the current user's details", () => {
    render(<ProfilePanel />);

    expect(screen.getByDisplayValue(currentUser.email)).toBeInTheDocument();
    expect(screen.getByText("Profesor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByDisplayValue("UTC")).toBeInTheDocument();
  });

  it("disables save until the details actually change", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel />);

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByDisplayValue("Ada Lovelace"), "!");

    expect(saveButton).not.toBeDisabled();
  });

  it("saves the updated name and timezone", async () => {
    mockMutate.mockImplementation((_vars: unknown, opts: any) =>
      opts?.onSuccess?.({ ...currentUser, full_name: "Ada L." }),
    );
    const user = userEvent.setup();
    render(<ProfilePanel />);

    const nameInput = screen.getByDisplayValue("Ada Lovelace");
    await user.clear(nameInput);
    await user.type(nameInput, "Ada L.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        full_name: "Ada L.",
        timezone: "UTC",
        phone: null,
        address: null,
        cui_passport: null,
        nationality_id: null,
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ ...currentUser, full_name: "Ada L." });
    expect(toast.notify).toHaveBeenCalledWith("Perfil actualizado", "success");
  });

  it("rejects saving an empty name without calling the API", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel />);

    await user.clear(screen.getByDisplayValue("Ada Lovelace"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(toast.notify).toHaveBeenCalledWith("El nombre no puede estar vacío", "error");
  });

  it("requires the current password before changing it", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel />);

    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(screen.getByText("Ingresa tu contraseña actual")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("enforces the minimum new-password length", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfilePanel />);
    const [currentPassword, newPassword, confirm] = Array.from(
      container.querySelectorAll('input[type="password"]'),
    );

    await user.type(currentPassword, "old-secret");
    await user.type(newPassword, "short");
    await user.type(confirm, "short");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(
      screen.getByText("La nueva contraseña debe tener al menos 8 caracteres"),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("requires the confirmation to match the new password", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfilePanel />);
    const [currentPassword, newPassword, confirm] = Array.from(
      container.querySelectorAll('input[type="password"]'),
    );

    await user.type(currentPassword, "old-secret");
    await user.type(newPassword, "new-secret-1");
    await user.type(confirm, "something-else");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(screen.getByText("Las contraseñas no coinciden")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("submits the password change and clears the form on success", async () => {
    mockMutate.mockImplementation((_vars: unknown, opts: any) => opts?.onSuccess?.());
    const user = userEvent.setup();
    const { container } = render(<ProfilePanel />);
    const [currentPassword, newPassword, confirm] = Array.from(
      container.querySelectorAll('input[type="password"]'),
    );

    await user.type(currentPassword, "old-secret");
    await user.type(newPassword, "new-secret-1");
    await user.type(confirm, "new-secret-1");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { current_password: "old-secret", password: "new-secret-1" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(toast.notify).toHaveBeenCalledWith("Contraseña actualizada", "success");
    expect(currentPassword).toHaveValue("");
    expect(newPassword).toHaveValue("");
    expect(confirm).toHaveValue("");
  });

  it("shows a server error message when the password change fails", async () => {
    mockMutate.mockImplementation((_vars: unknown, opts: any) =>
      opts?.onError?.({
        response: { data: { detail: "La contraseña actual no es correcta" } },
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<ProfilePanel />);
    const [currentPassword, newPassword, confirm] = Array.from(
      container.querySelectorAll('input[type="password"]'),
    );

    await user.type(currentPassword, "wrong");
    await user.type(newPassword, "new-secret-1");
    await user.type(confirm, "new-secret-1");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(screen.getByText("La contraseña actual no es correcta")).toBeInTheDocument();
  });
});
