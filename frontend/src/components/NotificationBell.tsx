import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatDateTime } from "../lib/format";
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../lib/queries";
import type { Notification } from "../lib/types";

function getNotificationRoute(n: Notification): string | null {
  const k = (n.kind || "").toLowerCase();
  const t = (n.title || "").toLowerCase();
  const b = (n.body || "").toLowerCase();

  if (k.includes("assignment") || k.includes("tarea") || t.includes("tarea") || b.includes("tarea")) {
    return "/?m=tareas";
  }
  if (k.includes("payment") || k.includes("pago") || k.includes("cuota") || t.includes("pago") || t.includes("cuota")) {
    return "/?m=progreso";
  }
  if (k.includes("grade") || k.includes("nota") || t.includes("nota") || t.includes("calificaci")) {
    return "/?m=progreso";
  }
  if (k.includes("session") || k.includes("clase") || t.includes("clase") || b.includes("clase")) {
    return "/?m=inicio";
  }
  if (k.includes("login") || k.includes("sesion") || t.includes("acceso")) {
    return "/?m=perfil";
  }
  return null;
}

/** Header bell with an unread badge and a dropdown of recent notifications. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  function handleNotificationClick(n: Notification) {
    if (!n.read_at) {
      markRead.mutate(n.id);
    }
    const target = getNotificationRoute(n);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notificaciones"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-sm font-medium">Notificaciones</span>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Marcar todas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  Sin notificaciones.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`px-3 py-2.5 text-sm cursor-pointer transition hover:bg-slate-50 ${
                        n.read_at ? "" : "bg-brand-50/60"
                      }`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-semibold text-xs text-slate-800">{n.title}</div>
                        {!n.read_at && (
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 flex-none mt-1" />
                        )}
                      </div>
                      <div className="text-2xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.body}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-3xs text-slate-400">
                        <span>{formatDateTime(n.created_at)}</span>
                        <span className="text-brand-600 font-medium">Ver detalle →</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
