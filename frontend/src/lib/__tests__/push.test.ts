import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { enablePush, getPushState, PushUnavailableError, urlBase64ToUint8Array } from "../push";

/**
 * Los avisos push dependen de lo que el navegador sepa hacer y de lo que la
 * persona haya permitido; cada combinación tiene que acabar en un estado que la
 * pantalla sepa explicar.
 */

function stubBrowser({
  push = true,
  permission = "default" as NotificationPermission,
  subscribed = false,
  ua = "Mozilla/5.0 (Linux; Android 14) Chrome/128",
  standalone = false,
} = {}) {
  vi.stubGlobal("navigator", {
    userAgent: ua,
    platform: "Linux",
    maxTouchPoints: 5,
    serviceWorker: push
      ? {
          getRegistration: async () => ({
            pushManager: { getSubscription: async () => (subscribed ? { endpoint: "x" } : null) },
          }),
        }
      : undefined,
  });
  if (!push) {
    // Safari fuera de la app instalada: no hay ni service worker ni PushManager.
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
  vi.stubGlobal("PushManager", push ? function PushManager() {} : undefined);
  vi.stubGlobal("Notification", push ? { permission } : undefined);
  if (!push) {
    delete (window as unknown as Record<string, unknown>).PushManager;
    delete (window as unknown as Record<string, unknown>).Notification;
  }
  vi.stubGlobal("matchMedia", () => ({ matches: standalone }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url sin relleno", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("getPushState", () => {
  it("activados cuando hay permiso y suscripción", async () => {
    stubBrowser({ permission: "granted", subscribed: true });
    expect(await getPushState()).toBe("on");
  });

  it("apagados si hay permiso pero no suscripción (p. ej. tras cerrar sesión)", async () => {
    stubBrowser({ permission: "granted", subscribed: false });
    expect(await getPushState()).toBe("off");
  });

  it("bloqueados cuando la persona los denegó", async () => {
    stubBrowser({ permission: "denied" });
    expect(await getPushState()).toBe("denied");
  });

  it("en iPhone con Safari pide instalar primero", async () => {
    stubBrowser({ push: false, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari" });
    expect(await getPushState()).toBe("needs-install");
  });

  it("un navegador sin avisos se dice como tal", async () => {
    stubBrowser({ push: false });
    expect(await getPushState()).toBe("unsupported");
  });
});

describe("enablePush", () => {
  it("si la academia no los configuró, lo explica en vez de pedir permiso", async () => {
    stubBrowser();
    const requestPermission = vi.fn();
    (Notification as unknown as { requestPermission: unknown }).requestPermission = requestPermission;
    vi.spyOn(api, "get").mockResolvedValue({ data: { public_key: "" } });

    await expect(enablePush()).rejects.toBeInstanceOf(PushUnavailableError);
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
