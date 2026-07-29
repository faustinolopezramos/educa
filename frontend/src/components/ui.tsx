import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function Button({
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wide transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none";
  const variants: Record<string, string> = {
    primary:
      "bg-brand-600 text-white shadow-xs shadow-brand-600/20 hover:bg-brand-700 hover:shadow-sm hover:shadow-brand-600/25 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
    secondary:
      "bg-white text-slate-700 border border-slate-200/90 shadow-2xs hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200",
    danger:
      "bg-red-600 text-white shadow-xs shadow-red-600/20 hover:bg-red-700 hover:shadow-sm hover:shadow-red-600/25 focus:outline-none focus:ring-2 focus:ring-red-500/30",
    ghost:
      "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 focus:outline-none",
  };
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
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
  hoverable = false,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 ${
        hoverable ? "card-hover-lift cursor-pointer hover:border-brand-300" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function QuickActionButton({
  icon,
  title,
  description,
  onClick,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  badge?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex items-start gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md active:translate-y-0"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-800 transition-colors group-hover:text-brand-700">
            {title}
          </span>
          {badge && <span>{badge}</span>}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{description}</p>
        )}
      </div>
    </button>
  );
}

export function InlineAlert({
  type = "info",
  title,
  children,
}: {
  type?: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
}) {
  const styles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    info: { bg: "bg-blue-50/70", border: "border-blue-200", text: "text-blue-900", icon: "ℹ️" },
    success: { bg: "bg-emerald-50/70", border: "border-emerald-200", text: "text-emerald-900", icon: "✓" },
    warning: { bg: "bg-amber-50/70", border: "border-amber-200", text: "text-amber-900", icon: "⚠️" },
    error: { bg: "bg-red-50/70", border: "border-red-200", text: "text-red-900", icon: "✕" },
  };
  const s = styles[type];
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${s.border} ${s.bg} p-4 text-sm ${s.text}`}>
      <span className="flex-none text-base">{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/60 pb-4">
      <div>
        {subtitle && <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">{subtitle}</div>}
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
    <h3 className={`mb-3 text-[15px] font-semibold text-slate-800 tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="bg-slate-50/80 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-slate-700">{children}</td>;
}

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 transition-colors focus:outline-none"
        aria-label="Acciones"
        title="Opciones"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[140px] origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                item.danger
                  ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
    slate: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
    green: { bg: "bg-emerald-50 text-emerald-700 border border-emerald-200/60", text: "text-emerald-700", dot: "bg-emerald-500" },
    red: { bg: "bg-red-50 text-red-700 border border-red-200/60", text: "text-red-700", dot: "bg-red-500" },
    amber: { bg: "bg-amber-50 text-amber-700 border border-amber-200/60", text: "text-amber-700", dot: "bg-amber-500" },
    indigo: { bg: "bg-brand-50 text-brand-700 border border-brand-200/60", text: "text-brand-700", dot: "bg-brand-500" },
  };
  const c = colors[color];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
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

// Intuitive TimePicker dropdown with 12h AM/PM & 24h formatted options.
export function TimePicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const timeSlots: string[] = [];
  for (let h = 6; h <= 22; h++) {
    const hh = String(h).padStart(2, "0");
    timeSlots.push(`${hh}:00`);
    if (h < 22) timeSlots.push(`${hh}:30`);
  }

  const cleanVal = value ? value.slice(0, 5) : "08:00";
  if (!timeSlots.includes(cleanVal)) {
    timeSlots.push(cleanVal);
    timeSlots.sort();
  }

  return (
    <Select
      value={cleanVal}
      onChange={(e) => onChange(e.target.value)}
      className={`font-mono text-xs ${className}`}
    >
      {timeSlots.map((t) => {
        const [h, m] = t.split(":").map(Number);
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const displayLabel = `${t} (${h12}:${String(m).padStart(2, "0")} ${ampm})`;
        return (
          <option key={t} value={t}>
            {displayLabel}
          </option>
        );
      })}
    </Select>
  );
}

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
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

// KPI / data card: big serif number + label + optional trend/hint.
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "dark" | "brand";
  icon?: ReactNode;
}) {
  if (tone === "brand") {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-100">{label}</div>
          {icon && <div className="text-xl text-brand-200">{icon}</div>}
        </div>
        <div className="mt-2 font-serif text-3xl font-bold tracking-tight text-white">{value}</div>
        {hint && <div className="mt-1 text-xs text-brand-100/80">{hint}</div>}
      </div>
    );
  }

  const dark = tone === "dark";
  return (
    <div
      className={`rounded-xl border p-5 transition-all card-hover-lift ${
        dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200/80 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-slate-400" : "text-slate-500"}`}>
          {label}
        </div>
        {icon && <div className={`text-lg ${dark ? "text-amber-400" : "text-brand-600"}`}>{icon}</div>}
      </div>
      <div
        className={`mt-2 font-serif text-3xl font-semibold tracking-tight ${
          dark ? "text-amber-400" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/60 px-6 py-10 text-center animate-fade-in">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-600 shadow-sm">
        {icon}
      </div>
      <div className="font-semibold text-slate-800 text-base">{title}</div>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500 leading-relaxed">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Loading skeleton row — replaces "Cargando…" text.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-slate-200/80 ${className}`}
      style={{ animation: "pulse-soft 1.4s ease-in-out infinite" }}
    />
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog over a dimmed backdrop.
 *
 * The frame is fixed and the body scrolls, so the title and the action bar stay
 * visible no matter how long the form is — a tall modal never hides its own
 * "Guardar" button. Escape and clicks outside close it, Tab stays inside, and
 * passing `onSubmit` turns the frame into a real form so Enter submits from any
 * field instead of forcing a trip to the mouse.
 *
 * Rendered through a portal on <body>. `position: fixed` is relative to the
 * nearest ancestor carrying a transform, and the app's <main> keeps one for
 * good (`animate-fade-in` ends on `translateY(0)` with fill-mode forwards), so
 * an in-tree overlay would cover <main>'s box instead of the window — on a long
 * page that centres the dialog somewhere down the scroll, half off-screen.
 */
export function Modal({
  title,
  description,
  onClose,
  onSubmit,
  footer,
  children,
  maxWidth = "max-w-md",
}: {
  title: ReactNode;
  /** One line under the title: what this dialog is for, or its consequence. */
  description?: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  /** Action bar pinned to the bottom — usually a <ModalActions>. */
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    // Start on the first real field so typing works immediately. The close
    // button is skipped — landing there means Enter would dismiss the dialog.
    const focusables = frameRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = Array.from(focusables ?? []).find(
      (el) => el.getAttribute("aria-label") !== "Cerrar",
    );
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !frameRef.current) return;
      const items = Array.from(
        frameRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const start = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const body = (
    <>
      <div className="flex flex-none items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-medium text-slate-900">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 flex-none rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

      {footer && (
        <div className="flex-none border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
          {footer}
        </div>
      )}
    </>
  );

  // `dvh` tracks the space browser chrome actually leaves, and `my-auto` keeps
  // the dialog centred while still letting the overlay scroll if it ever grows
  // taller than the window — with plain `items-center` the top would overflow
  // out of reach.
  const frameClass = `my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl ${maxWidth}`;

  return createPortal(
    <div
      ref={frameRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {onSubmit ? (
        <form
          role="dialog"
          aria-modal="true"
          className={frameClass}
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          className={frameClass}
          onClick={(e) => e.stopPropagation()}
        >
          {body}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * The action bar every dialog ends with: optional context on the left, cancel
 * then confirm on the right, in that order everywhere so the confirm button is
 * always in the same place.
 */
export function ModalActions({
  hint,
  children,
}: {
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="min-w-0 text-[11px] leading-snug text-slate-500">{hint}</div>
      <div className="flex flex-none items-center gap-2.5">{children}</div>
    </div>
  );
}

export interface SearchOption {
  value: number | string;
  label: string;
  /** Secondary line — searched too, so an email or code finds the row. */
  hint?: string;
}

/**
 * Combobox for lists too long to scan in a native <select>: type to filter,
 * arrows to move, Enter to pick. Used wherever the list is people or courses,
 * which grow without bound as the academy does.
 *
 * The popover is portalled and positioned in viewport coordinates. Inline it
 * would be an absolutely-positioned child of the modal body, which scrolls —
 * and a scroll container clips its absolute descendants, cutting the list off
 * a couple of rows in.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  emptyLabel = "Sin resultados",
  disabled = false,
  autoFocus = false,
  className = "",
}: {
  options: SearchOption[];
  value: number | string | null;
  onChange: (value: number | string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  useEffect(() => setCursor(0), [query, open]);

  // Track the trigger's position while open: the popover lives on <body>, so it
  // has to follow the field when the dialog behind it scrolls or the window
  // resizes.
  useEffect(() => {
    if (!open) return;
    function place() {
      const box = boxRef.current?.getBoundingClientRect();
      if (box) setRect({ top: box.bottom + 4, left: box.left, width: box.width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Close when the click lands anywhere else on the page. The popover is not a
  // DOM child of the field any more, so it needs checking separately.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function pick(option: SearchOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        autoFocus={autoFocus}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/25 disabled:opacity-50 ${
          selected ? "text-slate-900" : "text-slate-400"
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <span className="flex-none text-xs text-slate-400">▾</span>
      </button>

      {open && rect && createPortal(
        <div
          ref={popoverRef}
          style={{ top: rect.top, left: rect.left, width: rect.width }}
          className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              value={query}
              placeholder="Escribe para buscar…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape here means "close the list", not "close the modal
                // this combobox sits in", so it must not bubble.
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const option = filtered[cursor];
                  if (option) pick(option);
                }
              }}
              className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div role="listbox" className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">{emptyLabel}</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                  className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition ${
                    i === cursor ? "bg-brand-50 text-brand-900" : "text-slate-700"
                  }`}
                >
                  <span className="text-sm font-medium">{o.label}</span>
                  {o.hint && <span className="text-[11px] text-slate-400">{o.hint}</span>}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
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
    <Modal
      title={title}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Eliminando…" : confirmLabel}
          </Button>
        </ModalActions>
      }
    >
      <div className="text-sm leading-relaxed text-slate-600">{message}</div>
    </Modal>
  );
}
