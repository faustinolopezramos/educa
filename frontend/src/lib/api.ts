import axios from "axios";
import { getSupabaseAccessToken } from "./supabase";

const TOKEN_KEY = "educa_token";
const REFRESH_KEY = "educa_refresh_token";

const API_URL = import.meta.env.VITE_API_URL ?? "";

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

// Attach the bearer token to every request.
// Priority: Supabase token > local token
api.interceptors.request.use(async (config) => {
  const supabaseToken = await getSupabaseAccessToken();
  const localToken = getToken();
  const token = supabaseToken || localToken;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Fired on a 403 so the UI can show a transient "no autorizado" toast.
export const FORBIDDEN_EVENT = "api:forbidden";
// Fired when the session is truly gone (refresh also failed).
export const LOGOUT_EVENT = "api:logout";

// On 401 (token expired/invalid), trigger logout event since Supabase handles refresh.
// On 403, notify the UI.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const req = error.config;
    const stat = error.response?.status;

    // 401 → Supabase should handle token refresh automatically.
    // If we still get 401, the session is truly gone.
    if (stat === 401 && req && !req._retried) {
      req._retried = true;
      // Try to get a fresh Supabase token
      const freshToken = await getSupabaseAccessToken();
      if (freshToken) {
        req.headers.Authorization = `Bearer ${freshToken}`;
        return await api(req);
      }
      // No valid token — full logout.
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

/**
 * The structured `detail` of a FastAPI error, when there is one.
 *
 * Several endpoints answer a refusal with more than a sentence — the courses
 * still to reassign, the prerequisites a course has not met, the slots that
 * clash. `apiErrorMessage` flattens all of that to one line; this hands the
 * caller the object so it can show the list instead.
 */
export function apiErrorDetail(
  error: unknown,
): Record<string, unknown> | null {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  return null;
}

/** Extracts a human-readable message from a FastAPI error response. */
export function apiErrorMessage(error: unknown, fallback = "Ocurrió un error"): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "msg" in first) {
      return String((first as { msg: unknown }).msg);
    }
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
