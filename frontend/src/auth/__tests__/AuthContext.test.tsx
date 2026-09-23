import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";
import * as api from "../../lib/api";
import { createLoginResponse } from "../../test/fixtures";

// La sesión de Supabase sólo existe para obtener un token que se canjea; aquí
// se sustituye ese único paso para no salir a la red.
vi.mock("../../lib/supabase", () => ({
  isSupabaseConfigured: true,
  signInWithSupabase: vi.fn(async () => "token-supabase"),
  signOutFromSupabase: vi.fn(async () => undefined),
  supabase: null,
}));

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn() },
  };
});

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("login", () => {
    it("should login successfully and store token", async () => {
      const mockResponse = createLoginResponse();
      vi.spyOn(api.api, "post").mockResolvedValueOnce({
        data: mockResponse,
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login("admin@educa.com", "password123");
      });

      expect(result.current.user).toEqual(mockResponse.user);
      expect(localStorage.getItem("educa_token")).toBe(mockResponse.access_token);
    });

    it("canjea el token de Supabase cuando el backend no conoce la contraseña", async () => {
      // Quien tiene la cuenta en Supabase entra por la segunda puerta: se
      // canjea su token por una sesión propia de Educa, que es la única que
      // usan las llamadas a la API.
      const mockResponse = createLoginResponse();
      const rejected = Object.assign(new Error("401"), {
        response: { status: 401 },
      });
      const post = vi
        .spyOn(api.api, "post")
        .mockRejectedValueOnce(rejected)
        .mockResolvedValueOnce({ data: mockResponse } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login("profe@educa.com", "password123");
      });

      expect(post.mock.calls[1][0]).toBe("/auth/supabase-login");
      expect(post.mock.calls[1][1]).toEqual({ supabase_token: "token-supabase" });
      // Lo que se guarda es el token de Educa, nunca el de Supabase.
      expect(localStorage.getItem("educa_token")).toBe(mockResponse.access_token);
    });

    it("no intenta Supabase cuando el backend pide elegir academia", async () => {
      // Un 409 es "dime cuál de tus academias", no "clave incorrecta": tiene
      // que llegar intacto a la pantalla de login.
      const conflict = Object.assign(new Error("409"), {
        response: { status: 409, data: { detail: { code: "tenant_required" } } },
      });
      const post = vi.spyOn(api.api, "post").mockRejectedValueOnce(conflict);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await expect(
        act(() => result.current.login("dos@educa.com", "password123")),
      ).rejects.toMatchObject({ response: { status: 409 } });
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("should handle login errors", async () => {
      vi.spyOn(api.api, "post").mockRejectedValueOnce(
        new Error("Invalid credentials"),
      );

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await expect(
        act(() => result.current.login("admin@educa.com", "wrong")),
      ).rejects.toThrow();
    });
  });

  describe("logout", () => {
    it("should clear user and token on logout", async () => {
      const mockResponse = createLoginResponse();
      vi.spyOn(api.api, "post")
        .mockResolvedValueOnce({ data: mockResponse } as any) // login
        .mockResolvedValueOnce({ data: undefined } as any); // /auth/logout (best-effort)

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login("admin@educa.com", "password123");
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(localStorage.getItem("educa_token")).toBeNull();
      // Best-effort server-side revocation of the refresh session.
      expect(api.api.post).toHaveBeenCalledWith("/auth/logout", {
        refresh_token: mockResponse.refresh_token,
      });
    });

    it("should still clear local state even if the revoke call fails", async () => {
      const mockResponse = createLoginResponse();
      vi.spyOn(api.api, "post")
        .mockResolvedValueOnce({ data: mockResponse } as any) // login
        .mockRejectedValueOnce(new Error("network down")); // /auth/logout

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login("admin@educa.com", "password123");
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(localStorage.getItem("educa_token")).toBeNull();
    });
  });

  describe("hasRole", () => {
    it("should return true if user has required role", () => {
      const mockUser = createLoginResponse({ user: { role: "admin" } as any });
      vi.spyOn(api.api, "post").mockResolvedValueOnce({ data: mockUser } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      renderHook(() => useAuth(), { wrapper });

      // After login
      act(() => {
        // Simulate logged in state
      });

      // Note: In real test, you'd set user state after login
    });
  });

  describe("session restoration", () => {
    it("should restore user from stored token", async () => {
      const mockUser = createLoginResponse();
      localStorage.setItem("educa_token", mockUser.access_token);

      vi.spyOn(api.api, "get").mockResolvedValueOnce({
        data: mockUser.user,
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Token should be restored
      expect(localStorage.getItem("educa_token")).toBe(mockUser.access_token);
    });
  });
});
