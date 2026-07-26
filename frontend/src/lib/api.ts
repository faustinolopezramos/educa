import axios from "axios";

const TOKEN_KEY = "educa_token";
const REFRESH_KEY = "educa_refresh_token";

const API_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_URL,
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setToken(token: string | null, refreshToken?: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (refreshToken !== undefined) {
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

// No-op kept for backwards compat; logout is now handled via the LOGOUT_EVENT.
export function onForceLogout(_fn: () => void) {}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const { access_token, refresh_token: newRefresh } = res.data;
    setToken(access_token, newRefresh);
    return access_token;
  } catch {
    return null;
  }
}

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Fired on a 403 so the UI can show a transient "no autorizado" toast.
export const FORBIDDEN_EVENT = "api:forbidden";
// Fired when the session is truly gone (refresh also failed).
export const LOGOUT_EVENT = "api:logout";

// On 401, attempt a silent refresh. If that fails, drop everything.
// On 403, notify the UI.
let _refreshing = false;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const req = error.config;
    const stat = error.response?.status;

    // 401 → try refresh once, then give up.
    if (stat === 401 && req && !req._retried) {
      req._retried = true;
      if (_refreshing) {
        // Another interceptor call is already refreshing; queue this one.
        return new Promise((resolve) => {
          const check = setInterval(() => {
            if (!_refreshing) {
              clearInterval(check);
              const token = getToken();
              if (token) {
                req.headers.Authorization = `Bearer ${token}`;
                resolve(api(req));
              } else {
                resolve(Promise.reject(error));
              }
            }
          }, 100);
        });
      }
      _refreshing = true;
      try {
        const newToken = await tryRefresh();
        if (newToken) {
          req.headers.Authorization = `Bearer ${newToken}`;
          return await api(req);
        }
      } finally {
        _refreshing = false;
      }
      // Refresh failed — full logout.
      setToken(null, null);
      window.dispatchEvent(new CustomEvent(LOGOUT_EVENT));
      return Promise.reject(error);
    }

    if (stat === 403) {
      window.dispatchEvent(
        new CustomEvent(FORBIDDEN_EVENT, {
          detail: "No tienes permisos para esta acción.",
        }),
      );
    }
    return Promise.reject(error);
  },
);

/** Extracts a human-readable message from a FastAPI error response. */
export function apiErrorMessage(error: unknown, fallback = "Ocurrió un error"): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}
