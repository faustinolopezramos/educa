import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, getRefreshToken, getToken, LOGOUT_EVENT, setToken } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import type { LoginResponse, Permission, Role, User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
  /** Applies a fresh user object (e.g. after saving profile changes) without a full reload. */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  async function login(email: string, password: string): Promise<User> {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const res = await api.post<LoginResponse>("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    setToken(res.data.access_token, res.data.refresh_token);
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    // Read the refresh token before clearing it locally, and best-effort ask
    // the server to revoke it — a "logged out" refresh token shouldn't still
    // be able to mint new access tokens. Never blocks the local logout: it
    // must succeed even if this request fails or the backend is unreachable.
    const refreshToken = getRefreshToken();
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
