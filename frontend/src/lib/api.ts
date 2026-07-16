import axios from "axios";

const TOKEN_KEY = "educa_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

// On 401, drop the token (return to login). On 403, notify the UI.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const stat = error.response?.status;
    if (stat === 401) {
      setToken(null);
    } else if (stat === 403) {
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
