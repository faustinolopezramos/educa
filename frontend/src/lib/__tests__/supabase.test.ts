import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectEmailProvider,
  finishProviderLogin,
} from "../supabase";

describe("supabase lib helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe("detectEmailProvider", () => {
    it("detects Google email domains correctly", () => {
      expect(detectEmailProvider("usuario@gmail.com")).toBe("google");
      expect(detectEmailProvider("USUARIO@GMAIL.COM")).toBe("google");
      expect(detectEmailProvider("profesor@googlemail.com")).toBe("google");
    });

    it("detects Microsoft / Outlook email domains correctly", () => {
      expect(detectEmailProvider("estudiante@outlook.com")).toBe("azure");
      expect(detectEmailProvider("profesor@hotmail.com")).toBe("azure");
      expect(detectEmailProvider("admin@live.com")).toBe("azure");
      expect(detectEmailProvider("persona@msn.com")).toBe("azure");
      expect(detectEmailProvider("contacto@microsoft.com")).toBe("azure");
    });

    it("returns null for other domains or generic institutions", () => {
      expect(detectEmailProvider("usuario@miacademia.edu")).toBeNull();
      expect(detectEmailProvider("test@yahoo.com")).toBeNull();
      expect(detectEmailProvider("profe@educa.com")).toBeNull();
      expect(detectEmailProvider("invalido")).toBeNull();
    });
  });

  describe("finishProviderLogin with direct accessToken", () => {
    it("returns direct token without needing code exchange", async () => {
      sessionStorage.setItem("educa-oauth-tenant", "academia-test");
      sessionStorage.setItem("educa-oauth-return", "/cursos");

      const result = await finishProviderLogin(undefined, {
        accessToken: "direct-token-123",
      });

      expect(result.supabaseToken).toBe("direct-token-123");
      expect(result.tenantSlug).toBe("academia-test");
      expect(result.returnTo).toBe("/cursos");
    });
  });
});
