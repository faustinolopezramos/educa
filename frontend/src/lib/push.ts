import { useEffect, useState } from "react";

import { api } from "./api";

/**
 * La app instalable y los avisos push, del lado del navegador.
 *
 * Tres piezas:
 * - el service worker (`public/sw.js`), que sólo muestra avisos y abre la app
 *   al tocarlos;
 * - la suscripción de *este* dispositivo, que se da de alta en `/push` y cuyo
 *   consentimiento es el permiso de notificaciones del propio navegador;
 * - el aviso de instalación, que Chrome/Android ofrecen con
 *   `beforeinstallprompt` y que en iPhone hay que explicar a mano (Compartir →
 *   Añadir a pantalla de inicio). En iPhone, además, los avisos push sólo
 *   existen dentro de la app instalada.
 */

export type PushState =
  /** El navegador no sabe de avisos push. */
  | "unsupported"
  /** iPhone/iPad en Safari: primero hay que añadirla a la pantalla de inicio. */
  | "needs-install"
  /** La persona los bloqueó; sólo se desbloquean desde los ajustes del navegador. */
  | "denied"
  | "off"
  | "on";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALL_EVENT = "educa:install-available";
let deferredInstall: BeforeInstallPromptEvent | null = null;

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS se presenta como un Mac con pantalla táctil.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Se llama una vez al arrancar la app (main.tsx). */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // Chrome ofrece instalar muy pronto, antes de que ninguna pantalla que lo
  // use esté montada: se guarda el evento para cuando haga falta.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la app funciona igual; sólo no hay avisos push.
    });
  });
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

/** La clave pública VAPID, en el formato que pide `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export class PushUnavailableError extends Error {}

/** Pide permiso (si hace falta), suscribe este dispositivo y lo da de alta. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return getPushState();
  const { public_key: publicKey } = (await api.get<{ public_key: string }>("/push/config")).data;
  if (!publicKey) {
    throw new PushUnavailableError("Tu academia todavía no tiene activados los avisos push.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return getPushState();

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  await api.post("/push/subscriptions", sub.toJSON());
  return "on";
}

/** Da de baja este dispositivo, en el servidor y en el navegador. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api.post("/push/subscriptions/remove", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return getPushState();
}

/**
 * Al cerrar sesión, el dispositivo deja de recibir los avisos de esa persona.
 * Sólo en el navegador: el token ya no vale para llamar a la API, y el primer
 * aviso que el servidor intente mandar aquí recibirá un 410 y borrará la fila.
 */
export function forgetDeviceOnLogout(): void {
  void currentSubscription()
    .then((sub) => sub?.unsubscribe())
    .catch(() => {});
}

/**
 * Con la sesión abierta: si este dispositivo ya tiene avisos activados, se
 * vuelve a registrar a nombre de quien entró. Cubre el teléfono compartido y
 * la suscripción que el navegador renovó por su cuenta.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await api.post("/push/subscriptions", sub.toJSON()).catch(() => {});
}

export function usePushState(): [PushState | null, (s: PushState) => void] {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return [state, setState];
}

/** Si se puede ofrecer instalar la app, y cómo. */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(() => deferredInstall !== null);
  useEffect(() => {
    const onChange = () => setAvailable(deferredInstall !== null);
    window.addEventListener(INSTALL_EVENT, onChange);
    return () => window.removeEventListener(INSTALL_EVENT, onChange);
  }, []);

  async function install(): Promise<boolean> {
    if (!deferredInstall) return false;
    await deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    setAvailable(false);
    return outcome === "accepted";
  }

  return {
    installed: isStandalone(),
    /** Chrome/Android: hay un botón de instalar que funciona. */
    canPrompt: available,
    /** iPhone en Safari: sólo se puede explicar el paso manual. */
    iosManual: isIos() && !isStandalone(),
    install,
  };
}
