// Lightweight global toast bus. Any module can push a toast without prop-drilling.
export const TOAST_EVENT = "app:toast";

export type ToastVariant = "success" | "error" | "info";

export interface ToastDetail {
  message: string;
  variant: ToastVariant;
}

export function notify(message: string, variant: ToastVariant = "info"): void {
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, variant } }),
  );
}
