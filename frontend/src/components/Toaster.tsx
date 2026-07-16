import { useEffect, useState } from "react";

import { FORBIDDEN_EVENT } from "../lib/api";
import { TOAST_EVENT, type ToastDetail, type ToastVariant } from "../lib/toast";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const styles: Record<ToastVariant, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-green-200 bg-green-50 text-green-700",
  info: "border-slate-200 bg-white text-slate-700",
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
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${styles[t.variant]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
