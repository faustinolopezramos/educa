import { useEffect, useState } from "react";

import { FORBIDDEN_EVENT } from "../lib/api";
import { TOAST_EVENT, type ToastDetail, type ToastVariant } from "../lib/toast";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const styles: Record<ToastVariant, { box: string; icon: string; glyph: string }> = {
  error: { box: "border-red-100 bg-red-50 text-red-700", icon: "bg-red-600", glyph: "!" },
  success: {
    box: "border-green-100 bg-green-50 text-green-700",
    icon: "bg-green-600",
    glyph: "\u2713",
  },
  info: { box: "border-slate-200 bg-white text-slate-700", icon: "bg-slate-400", glyph: "i" },
};

// Listens for global toast events (and legacy api:forbidden) and shows them.
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function push(message: string, variant: ToastVariant) {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
    function onForbidden(e: Event) {
      push((e as CustomEvent<string>).detail ?? "No autorizado", "error");
    }
    function onToast(e: Event) {
      const { message, variant } = (e as CustomEvent<ToastDetail>).detail;
      push(message, variant);
    }
    window.addEventListener(FORBIDDEN_EVENT, onForbidden);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(FORBIDDEN_EVENT, onForbidden);
      window.removeEventListener(TOAST_EVENT, onToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((t) => {
        const s = styles[t.variant];
        return (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${s.box}`}
          >
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[11px] font-bold text-white ${s.icon}`}
            >
              {s.glyph}
            </span>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
