import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

// forwardRef so React Hook Form's register() can attach to the DOM input.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/25 ${className}`}
        {...props}
      />
    );
  },
);

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  subtitle,
  action,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
        <h1 className="font-serif text-3xl font-medium tracking-tight text-slate-900">
          {children}
        </h1>
      </div>
      {action}
    </div>
  );
}

// Section heading used inside cards/panels.
export function SectionHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`mb-3 text-[15px] font-semibold text-slate-800 ${className}`}>
      {children}
    </h3>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-2.5 text-slate-700">{children}</td>;
}

// Square, semantic badge with an optional status dot.
export function Badge({
  children,
  color = "slate",
  dot = false,
}: {
  children: ReactNode;
  color?: "slate" | "green" | "red" | "amber" | "indigo";
  dot?: boolean;
}) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    slate: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
    green: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-600" },
    red: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-600" },
    indigo: { bg: "bg-brand-50", text: "text-brand-700", dot: "bg-brand-600" },
  };
  const c = colors[color];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-sm ${c.dot}`} />}
      {children}
    </span>
  );
}

// Native select styled to match Input.
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", ...props }, ref) {
  return (
    <select
      ref={ref}
      className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/25 ${className}`}
      {...props}
    />
  );
});

// Labeled field with an optional inline error message.
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// KPI / data card: big serif number + label + optional trend/hint.
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`rounded-xl border p-[18px] ${
        dark ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>
        {label}
      </div>
      <div
        className={`mt-1 font-serif text-3xl font-medium ${
          dark ? "text-amber-500" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className={`mt-0.5 text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

// Friendly empty state with an optional call to action.
export function EmptyState({
  icon = "◈",
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-600">
        {icon}
      </div>
      <div className="font-medium text-slate-700">{title}</div>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Loading skeleton row — replaces "Cargando…" text.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-slate-200 ${className}`}
      style={{ animation: "pulse-soft 1.4s ease-in-out infinite" }}
    />
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

// Centered modal dialog over a dimmed backdrop. Click outside to close.
export function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-lg ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-xl font-medium text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Confirmation dialog for destructive actions.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Eliminar",
  onConfirm,
  onClose,
  busy = false,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="text-sm text-slate-600">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
