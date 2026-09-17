import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, getRefreshToken, getToken, LOGOUT_EVENT, setToken } from "../lib/api";
import { supabase, signIn, signOut } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import type { Permission, Role, User } from "../lib/types";

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

  // Listen for Supabase auth state changes and sync with backend
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Login en tu backend con token de Supabase
        try {
          const res = await api.post('/auth/supabase-login', {
            supabase_token: session.access_token
          })
          setToken(res.data.access_token, res.data.refresh_token)
          setUser(res.data.user)
        } catch (e) {
          console.error('Backend sync failed', e)
        }
      } else if (event === 'SIGNED_OUT') {
        setToken(null, null)
        setUser(null)
        queryClient.clear()
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])

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
    // Usar Supabase Auth para login - signIn lanza error si falla
    const data = await signIn(email, password)
    
    // El listener onAuthStateChange se encarga de sincronizar con backend
    // y setear el user en el contexto
    if (data.user) {
      // Esperar a que el listener procese la sesión
      await new Promise(resolve => setTimeout(resolve, 100))
      return data.user as unknown as User
    }
    throw new Error('Login failed')
  }

  function logout() {
    // Usar Supabase Auth para logout
    signOut()
    
    // Limpiar tokens locales y usuario inmediatamente
    const refreshToken = getRefreshToken();
    setToken(null, null);
    setUser(null);
    queryClient.clear();
    
    // Best-effort revoke refresh token en backend
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
