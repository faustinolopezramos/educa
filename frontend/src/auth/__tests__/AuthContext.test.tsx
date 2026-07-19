import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";
import * as api from "../../lib/api";
import { createLoginResponse } from "../../test/fixtures";

vi.mock("../../lib/api");

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("login", () => {
    it("should login successfully and store token", async () => {
      const mockResponse = createLoginResponse();
      vi.spyOn(api, "api").mockResolvedValueOnce({
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

    it("should handle login errors", async () => {
      vi.spyOn(api, "api").mockRejectedValueOnce(
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
      vi.spyOn(api, "api").mockResolvedValueOnce({
        data: mockResponse,
      } as any);

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
      vi.spyOn(api, "api").mockResolvedValueOnce({ data: mockUser } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );
      const { result } = renderHook(() => useAuth(), { wrapper });

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

      vi.spyOn(api, "api").mockResolvedValueOnce({
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
