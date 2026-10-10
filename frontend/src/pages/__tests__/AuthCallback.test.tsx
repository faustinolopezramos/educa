import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import * as AuthContext from "../../auth/AuthContext";
import * as supabase from "../../lib/supabase";
import AuthCallback from "../AuthCallback";

vi.mock("../../auth/AuthContext");
vi.mock("../../lib/supabase", () => ({
  finishProviderLogin: vi.fn(),
  clearProviderSession: vi.fn(),
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<p>Panel</p>} />
        <Route path="/clase/7" element={<p>Clase 7</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallback", () => {
  let exchange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exchange = vi.fn();
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      loginWithProviderToken: exchange,
      logout: vi.fn(),
      hasRole: vi.fn(),
      hasPermission: vi.fn(),
      updateUser: vi.fn(),
    } as never);
    vi.mocked(supabase.finishProviderLogin).mockResolvedValue({
      supabaseToken: "sb-token",
      returnTo: "/clase/7",
    });
  });

  it("exchanges the provider session and returns where the person was going", async () => {
    exchange.mockResolvedValue({ id: 1 });
    renderAt("/auth/callback?code=abc");
    await waitFor(() => expect(screen.getByText("Clase 7")).toBeInTheDocument());
    expect(supabase.finishProviderLogin).toHaveBeenCalledWith("abc");
    expect(exchange).toHaveBeenCalledWith("sb-token", undefined);
    expect(supabase.clearProviderSession).toHaveBeenCalled();
  });

  it("asks which academy when the email is in several, and retries with it", async () => {
    exchange
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            detail: {
              code: "tenant_required",
              tenants: [
                { id: 1, slug: "alfa", name: "Alfa" },
                { id: 2, slug: "beta", name: "Beta" },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({ id: 1 });
    renderAt("/auth/callback?code=abc");

    const select = await screen.findByLabelText("Institución / Academia");
    fireEvent.change(select, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByText("Clase 7")).toBeInTheDocument());
    expect(exchange).toHaveBeenLastCalledWith("sb-token", "beta");
    // Sin volver a pasar por el proveedor.
    expect(supabase.finishProviderLogin).toHaveBeenCalledTimes(1);
  });

  it("says plainly when the email has no account", async () => {
    exchange.mockRejectedValue({
      response: {
        status: 403,
        data: { detail: { code: "no_account", message: "El correo x@y.com no tiene cuenta en EDUCA." } },
      },
    });
    renderAt("/auth/callback?code=abc");
    expect(await screen.findByRole("alert")).toHaveTextContent("no tiene cuenta en EDUCA");
    expect(screen.getByRole("link", { name: /Volver a iniciar sesión/ })).toHaveAttribute("href", "/login");
  });

  it("explains a login the provider did not complete", async () => {
    renderAt("/auth/callback?error=access_denied");
    expect(await screen.findByRole("alert")).toHaveTextContent("no completó");
    expect(supabase.finishProviderLogin).not.toHaveBeenCalled();
  });

  it("handles access token received in hash fragment (e.g. Magic Link)", async () => {
    exchange.mockResolvedValue({ id: 1 });
    window.location.hash = "#access_token=token-from-hash";
    try {
      renderAt("/auth/callback");
      await waitFor(() => expect(screen.getByText("Clase 7")).toBeInTheDocument());
      expect(supabase.finishProviderLogin).toHaveBeenCalledWith(undefined, {
        accessToken: "token-from-hash",
      });
      expect(exchange).toHaveBeenCalledWith("sb-token", undefined);
    } finally {
      window.location.hash = "";
    }
  });
});
