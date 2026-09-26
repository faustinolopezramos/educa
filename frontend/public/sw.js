/*
 * Service worker de Educa: sólo avisos push.
 *
 * No guarda la aplicación en caché a propósito. Un service worker que sirve la
 * app desde su caché es la forma clásica de dejar a la gente atrapada en una
 * versión vieja tras un despliegue, y Educa no necesita funcionar sin conexión
 * salvo al pasar lista — y eso ya lo cubre la cola de marcas del modo clase.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Educa";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      lang: "es",
      data: { url: data.url || "/" },
    }),
  );
});

// Tocar el aviso lleva a la app: a la pestaña que ya esté abierta si la hay, en
// vez de abrir otra más cada vez.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
