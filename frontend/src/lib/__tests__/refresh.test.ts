import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, getToken, setToken } from "../api";

/**
 * Refresh tokens rotate one-for-one, and the server reads a second redemption
 * of the same token as a stolen one being replayed — which revokes every
 * session the user has. So the client must never let two requests redeem the
 * same refresh token, even when several 401s arrive at once.
 *
 * jsdom has no Web Locks API, so these exercise the in-tab fallback. The
 * cross-tab path (`navigator.locks`) is the same `tryRefresh` body behind a real
 * mutex, and is not reachable from a single-context test runner.
 */

type Handler = (url: string, body: unknown) => { status: number; data: unknown };

let refreshCalls: string[] = [];
let handler: Handler;

function installAdapter() {
  const adapter = async (config: never) => {
    const cfg = config as unknown as { url?: string; baseURL?: string; data?: string };
    const url = `${cfg.baseURL ?? ""}${cfg.url ?? ""}`;
    const body = cfg.data ? JSON.parse(cfg.data) : undefined;
    const res = handler(url, body);
    if (res.status >= 400) {
      const err = new Error(`Request failed with status code ${res.status}`);
      Object.assign(err, {
        config: cfg,
        response: { status: res.status, data: res.data, config: cfg },
        isAxiosError: true,
      });
      throw err;
    }
    return { data: res.data, status: res.status, statusText: "OK", headers: {}, config: cfg };
  };
  // `tryRefresh` posts on the default axios instance; everything else goes
  // through `api`. Both need the fake transport.
  axios.defaults.adapter = adapter as never;
  api.defaults.adapter = adapter as never;
}

describe("concurrent token refresh", () => {
  beforeEach(() => {
    localStorage.clear();
    refreshCalls = [];
    installAdapter();
  });

  it("redeems the refresh token once even when several requests 401 together", async () => {
    setToken("expired-access", "refresh-1");

    let issued = 0;
    handler = (url, body) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls.push((body as { refresh_token: string }).refresh_token);
        issued += 1;
        return {
          status: 200,
          data: { access_token: `access-${issued}`, refresh_token: `refresh-${issued + 1}` },
        };
      }
      // Anything presenting the stale access token is rejected once; the retry
      // carries the refreshed one and succeeds.
      return getToken() === "expired-access"
        ? { status: 401, data: { detail: "expired" } }
        : { status: 200, data: { ok: true } };
    };

    const [a, b, c] = await Promise.all([
      api.get("/one"),
      api.get("/two"),
      api.get("/three"),
    ]);

    expect(refreshCalls).toEqual(["refresh-1"]);
    expect([a.data, b.data, c.data]).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(getToken()).toBe("access-1");
  });

  it("never replays a token another refresh already rotated away", async () => {
    setToken("expired-access", "refresh-1");

    handler = (url, body) => {
      if (url.endsWith("/auth/refresh")) {
        const presented = (body as { refresh_token: string }).refresh_token;
        refreshCalls.push(presented);
        // The server's rule: an already-rotated token is theft, not a retry.
        if (presented !== "refresh-1") {
          return { status: 401, data: { detail: "token reuse detected" } };
        }
        return {
          status: 200,
          data: { access_token: "access-1", refresh_token: "refresh-2" },
        };
      }
      return getToken() === "expired-access"
        ? { status: 401, data: { detail: "expired" } }
        : { status: 200, data: { ok: true } };
    };

    await Promise.all([api.get("/one"), api.get("/two")]);

    // One redemption, of the token that was actually current.
    expect(refreshCalls).toEqual(["refresh-1"]);
  });

  it("logs out once when the refresh itself is rejected", async () => {
    setToken("expired-access", "refresh-dead");
    const onLogout = vi.fn();
    window.addEventListener("api:logout", onLogout);

    handler = (url) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls.push("attempt");
        return { status: 401, data: { detail: "revoked" } };
      }
      return { status: 401, data: { detail: "expired" } };
    };

    await expect(api.get("/one")).rejects.toBeTruthy();

    expect(refreshCalls).toEqual(["attempt"]);
    expect(getToken()).toBeNull();
    expect(onLogout).toHaveBeenCalled();
    window.removeEventListener("api:logout", onLogout);
  });
});
