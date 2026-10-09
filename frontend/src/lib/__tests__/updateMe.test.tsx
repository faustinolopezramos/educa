import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, getRefreshToken, getToken, setToken } from "../api";
import { useUpdateMe } from "../queries/users";

/**
 * Cambiar la contraseña invalida todos los tokens anteriores, también los de la
 * sesión que la cambió. El servidor responde con un par nuevo; si el cliente no
 * lo guarda, la siguiente petición manda al usuario al login justo después de
 * decirle "Contraseña actualizada".
 */

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  setToken("old-access", "old-refresh");
});

afterEach(() => {
  vi.restoreAllMocks();
  setToken(null, null);
});

describe("useUpdateMe", () => {
  it("guarda el par nuevo que llega tras cambiar la contraseña", async () => {
    vi.spyOn(api, "patch").mockResolvedValue({
      data: { id: 1, tokens: { access_token: "new-access", refresh_token: "new-refresh" } },
    });
    const { result } = renderHook(() => useUpdateMe(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ current_password: "a", password: "b" });
    });

    expect(getToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");
  });

  it("no toca la sesión en una edición sin contraseña", async () => {
    vi.spyOn(api, "patch").mockResolvedValue({ data: { id: 1, tokens: null } });
    const { result } = renderHook(() => useUpdateMe(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ full_name: "Otro" });
    });

    expect(getToken()).toBe("old-access");
    expect(getRefreshToken()).toBe("old-refresh");
  });
});
