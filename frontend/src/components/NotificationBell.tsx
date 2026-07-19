import { useState } from "react";

import { formatDateTime } from "../lib/format";
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../lib/queries";

/** Header bell with an unread badge and a dropdown of recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

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
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  Sin notificaciones.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`px-3 py-2 text-sm ${n.read_at ? "" : "bg-brand-50"}`}
                      onClick={() => !n.read_at && markRead.mutate(n.id)}
                    >
                      <div className="font-medium text-slate-700">{n.title}</div>
                      <div className="text-xs text-slate-500">{n.body}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {formatDateTime(n.created_at)}
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
