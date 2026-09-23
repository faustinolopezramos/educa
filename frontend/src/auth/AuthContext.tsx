import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, getRefreshToken, getToken, LOGOUT_EVENT, setToken } from "../lib/api";
import { isSupabaseConfigured, signInWithSupabase, signOutFromSupabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import type { LoginResponse, Permission, Role, User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
  /** Applies a fresh user object (e.g. after saving profile changes) without a full reload. */
  updateUser: (user: User) => void;
}

const g = globalThis as unknown as {
  __EDUCA_AUTH_CONTEXT__?: ReturnType<typeof createContext<AuthContextValue | undefined>>;
};
if (!g.__EDUCA_AUTH_CONTEXT__) {
  g.__EDUCA_AUTH_CONTEXT__ = createContext<AuthContextValue | undefined>(undefined);
}
const AuthContext = g.__EDUCA_AUTH_CONTEXT__;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from a stored token on first load.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => setToken(null, null))
      .finally(() => setLoading(false));
  }, []);

  // Listen for forced logout (refresh failed).
  useEffect(() => {
    function handler() {
      setUser(null);
      queryClient.clear();
    }
    window.addEventListener(LOGOUT_EVENT, handler);
    return () => window.removeEventListener(LOGOUT_EVENT, handler);
  }, []);

  function applySession(data: LoginResponse): User {
    setToken(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  }

  async function login(email: string, password: string, tenantSlug?: string): Promise<User> {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    if (tenantSlug) {
      form.set("client_id", tenantSlug);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (tenantSlug) {
      headers["X-Tenant-Slug"] = tenantSlug;
    }

    try {
      const res = await api.post<LoginResponse>("/auth/login", form, { headers });
      return applySession(res.data);
    } catch (err) {
      // Sólo una credencial rechazada justifica probar con Supabase. Un 409
      // ("elige academia"), un 429 o un error del servidor tienen que llegar
      // tal cual a la pantalla de login, no convertirse en "clave incorrecta".
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401 || !isSupabaseConfigured) throw err;

      // Quien tenga la cuenta en Supabase entra por aquí: se canjea su token
      // por una sesión propia de Educa, que es la que usa toda la aplicación.
      // El canje es explícito, no un listener con una espera a ciegas.
      let supabaseToken: string;
      try {
        supabaseToken = await signInWithSupabase(email, password);
      } catch {
        // Si Supabase tampoco la reconoce, manda el error del backend.
        throw err;
      }
      const exchanged = await api.post<LoginResponse>(
        "/auth/supabase-login",
        { supabase_token: supabaseToken },
        tenantSlug ? { headers: { "X-Tenant-Slug": tenantSlug } } : undefined,
      );
      return applySession(exchanged.data);
    }
  }

  function logout() {
    // Read the refresh token before clearing it locally, and best-effort ask
    // the server to revoke it — a "logged out" refresh token shouldn't still
    // be able to mint new access tokens. Never blocks the local logout: it
    // must succeed even if this request fails or the backend is unreachable.
    const refreshToken = getRefreshToken();
    // La sesión de Supabase, si la hubo, se cierra también; nunca bloquea.
    void signOutFromSupabase();
    setToken(null, null);
    setUser(null);
    // Every cached query was fetched as the user who just left. On a shared
    // machine the next person to sign in would see their predecessor's roster,
    // grades and ledger rendered from cache before the refetch lands.
    queryClient.clear();
    if (refreshToken) {
      try {
        api.post("/auth/logout", { refresh_token: refreshToken })?.catch?.(() => {});
      } catch {
        // Logging out locally must never be blocked by this.
      }
    }
  }

  function hasRole(...roles: Role[]): boolean {
    return user !== null && roles.includes(user.role);
  }

  function hasPermission(permission: Permission): boolean {
    if (!user) return false;
    if (user.role === "admin" || user.role === "superadmin") return true;
    if (user.role === "assistant") {
      return Boolean(user.permissions?.includes(permission));
    }
    return false;
  }

  const value = useMemo(
    () => ({ user, loading, login, logout, hasRole, hasPermission, updateUser: setUser }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
