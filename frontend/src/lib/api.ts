import axios from "axios";

const TOKEN_KEY = "educa_token";
const REFRESH_KEY = "educa_refresh_token";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

// Refresh tokens rotate: each one may be redeemed exactly once, and the server
// treats a second presentation of an already-rotated token as a stolen token
// being replayed — which revokes *every* session of that user.
//
// That is the right call server-side, but it makes a concurrent refresh
// indistinguishable from a theft. Two tabs whose access tokens expire in the
// same minute both redeem the same refresh token, and the slower one gets the
// whole account logged out. So refreshing has to be serialized across tabs, not
// just within one.
const REFRESH_LOCK = "educa-token-refresh";

let _inFlight: Promise<unknown> | null = null;

async function withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
  // The Web Locks API is a real cross-tab mutex, which is exactly the shape of
  // this problem (Chrome 69+, Firefox 96+, Safari 15.4+). Guarded by `typeof`
  // rather than `navigator?.` — optional chaining still throws on an
  // undeclared identifier, which is what a non-DOM context gives us.
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks?.request) {
    return locks.request(REFRESH_LOCK, run) as Promise<T>;
  }
  // Without it (older browsers, jsdom) fall back to serializing inside this tab,
  // which is the guarantee the code had before. Chaining on the previous
  // attempt regardless of how it settled keeps one failure from wedging the queue.
  const next = (_inFlight ?? Promise.resolve()).then(run, run);
  _inFlight = next.catch(() => undefined);
  return next;
}

async function tryRefresh(): Promise<string | null> {
  const tokenOnEntry = getRefreshToken();
  return withRefreshLock(async () => {
    const refreshToken = getRefreshToken();
    // Whoever held the lock before us may have already rotated. Their new token
    // is in localStorage, so the work is done — redeeming the one we walked in
    // with is precisely the replay the server would read as theft.
    if (refreshToken && refreshToken !== tokenOnEntry) return getToken();
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
  });
}

// Attach the bearer token to every request.
//
// Deliberately no tenant header: which academy a caller belongs to is read
// server-side from their own user row. Letting the client name its tenant would
// make the answer to "whose data is this?" something the caller gets to pick.
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
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const req = error.config;
    const stat = error.response?.status;

    // 401 → try refresh once, then give up. Concurrent 401s all land in
    // `tryRefresh`, which takes the lock: the first one rotates and the rest
    // come back with the token it stored, rather than each redeeming the same
    // one and tripping the server's replay detection.
    if (stat === 401 && req && !req._retried) {
      req._retried = true;
      const newToken = await tryRefresh();
      if (newToken) {
        req.headers.Authorization = `Bearer ${newToken}`;
        return await api(req);
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
