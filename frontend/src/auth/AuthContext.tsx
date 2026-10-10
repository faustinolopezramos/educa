import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, getRefreshToken, getToken, LOGOUT_EVENT, setToken } from "../lib/api";
import { forgetDeviceOnLogout } from "../lib/push";
import { isSupabaseConfigured, signInWithSupabase, signOutFromSupabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import type { AcademyRegisterRequest, LoginResponse, MFAChallengeResponse, Permission, Role, User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<User | MFAChallengeResponse>;
  /** Canjea el token de Supabase (Google, Microsoft, Apple…) por una sesión de EDUCA. */
  loginWithProviderToken?: (supabaseToken: string, tenantSlug?: string) => Promise<User | MFAChallengeResponse>;
  registerAcademy?: (data: AcademyRegisterRequest) => Promise<User>;
  /** Verifica el código MFA y completa el login. */
  verifyMFA?: (token: string, tempToken: string) => Promise<User>;
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

  function isLoginResponse(data: LoginResponse | MFAChallengeResponse): data is LoginResponse {
    return !("mfa_required" in data) || !data.mfa_required;
  }

  function applySession(data: LoginResponse | MFAChallengeResponse): User {
    if (!isLoginResponse(data)) {
      throw new Error("MFA required but applySession called");
    }
    setToken(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  }

  async function login(email: string, password: string, tenantSlug?: string): Promise<User | MFAChallengeResponse> {
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
      const res = await api.post<LoginResponse | MFAChallengeResponse>("/auth/login", form, { headers });
      if ("mfa_required" in res.data && res.data.mfa_required) {
        return res.data;
      }
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
      return loginWithProviderToken(supabaseToken, tenantSlug);
    }
  }

  async function loginWithProviderToken(
    supabaseToken: string,
    tenantSlug?: string,
  ): Promise<User | MFAChallengeResponse> {
    const exchanged = await api.post<LoginResponse | MFAChallengeResponse>(
      "/auth/supabase-login",
      { supabase_token: supabaseToken },
      tenantSlug ? { headers: { "X-Tenant-Slug": tenantSlug } } : undefined,
    );
    if ("mfa_required" in exchanged.data && exchanged.data.mfa_required) {
      return exchanged.data;
    }
    return applySession(exchanged.data);
  }

  async function registerAcademy(data: AcademyRegisterRequest): Promise<User> {
    const res = await api.post<LoginResponse>("/auth/register-academy", data);
    return applySession(res.data);
  }

  async function verifyMFA(token: string, tempToken: string): Promise<User> {
    const res = await api.post<LoginResponse>(
      "/auth/mfa/verify",
      { token },
      { headers: { Authorization: `Bearer ${tempToken}` } },
    );
    return applySession(res.data);
  }

  function logout() {
    // Read the refresh token before clearing it locally, and best-effort ask
    // the server to revoke it — a "logged out" refresh token shouldn't still
    // be able to mint new access tokens. Never blocks the local logout: it
    // must succeed even if this request fails or the backend is unreachable.
    const refreshToken = getRefreshToken();
    // La sesión de Supabase, si la hubo, se cierra también; nunca bloquea.
    void signOutFromSupabase();
    // Este dispositivo deja de recibir los avisos de quien sale.
    forgetDeviceOnLogout();
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
    () => ({
      user,
      loading,
      login,
      loginWithProviderToken,
      registerAcademy,
      verifyMFA,
      logout,
      hasRole,
      hasPermission,
      updateUser: setUser,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
