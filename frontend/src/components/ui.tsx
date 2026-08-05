import { forwardRef, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconInfo,
  IconSearch,
} from "./icons";

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/**
 * Two sizes, four variants. The size prop exists because panels used to reach
 * for `!py-1.5 !px-3` to shrink a button — an `!important` override of the
 * design system in ~30 places, which is how three different button heights
 * ended up on the same toolbar.
 */
export function Button({
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500/50",
    secondary:
      "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/50",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
  };
  return (
    <button
      type={type}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

// forwardRef so React Hook Form's register() can attach to the DOM input.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
        {...props}
      />
    );
  },
);

// Native select styled to match Input, with a single chevron affordance.
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={`w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500 ${className}`}
        {...props}
      />
      <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
});

/**
 * Search field with the magnifier as a real adornment.
 *
 * Placeholders across the app used to start with a "🔍" character, which put an
 * icon inside the text value: screen readers read it aloud, it shifted the
 * placeholder's baseline, and it disappeared the moment the user typed.
 */
export function SearchInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        {...props}
      />
    </div>
  );
}

// Labeled field with an optional inline error message and required indicator.
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-slate-400 font-normal">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs leading-snug text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Segmented control for switching between views of the same data.
 *
 * This markup was copy-pasted into seven panels with slightly different
 * padding, radius and active colours each time — the same control looked like
 * three different controls depending on which screen you were on.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className={active ? "ml-1.5 text-slate-400" : "ml-1.5 text-slate-400"}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page structure
 * ------------------------------------------------------------------ */

/**
 * The single page header for every module.
 *
 * Each panel used to render its own "header bar" — an icon tile, a title, a
 * pill with a count, a row of emoji stats — *below* the title the dashboard had
 * already rendered. Every admin screen opened with its name written twice, in
 * two different type styles. One component, one title, one place for actions.
 *
 * `meta` is for facts about what is on screen (counts, totals). It is not a
 * place for buttons: those go in `actions`.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        )}
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A single fact in a PageHeader's `meta` row: "128 alumnos". */
export function MetaItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <span>
      <strong className="font-semibold text-slate-900">{value}</strong>{" "}
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

/** Back-compatible alias — same header, older call shape. */
export function PageTitle({
  children,
  subtitle,
  action,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return <PageHeader title={children} description={subtitle} actions={action} />;
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
    <h3 className={`mb-3 text-sm font-semibold tracking-tight text-slate-900 ${className}`}>
      {children}
    </h3>
  );
}

/** Filter/action strip that sits above a list. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  /** `none` for cards that wrap a full-bleed table. */
  padding?: "none" | "sm" | "md";
}) {
  const pad = { none: "", sm: "p-3.5", md: "p-5" }[padding];
  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${pad} ${className}`}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Data display
 * ------------------------------------------------------------------ */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

// Written out in full rather than interpolated: Tailwind scans source as plain
// text, so a `text-${align}` template produces a class that never gets built.
const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={`border-b border-slate-200 bg-slate-50 px-4 py-2.5 ${ALIGN[align]} text-xs font-semibold uppercase tracking-wide text-slate-500`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return <td className={`px-4 py-3 ${ALIGN[align]} text-slate-700`}>{children}</td>;
}

/**
 * KPI tile. Deliberately flat: a number that cannot be clicked should not lift
 * off the page when the pointer crosses it, and a gradient does not make a
 * count more informative.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "warning" | "critical";
}) {
  const tones: Record<string, string> = {
    default: "text-slate-900",
    positive: "text-emerald-700",
    warning: "text-amber-700",
    critical: "text-red-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular tracking-tight ${tones[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
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
  color?: "slate" | "green" | "red" | "amber" | "indigo" | "sky";
  dot?: boolean;
}) {
  const colors: Record<string, { box: string; dot: string }> = {
    slate: { box: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
    green: { box: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
    red: { box: "bg-red-50 text-red-800", dot: "bg-red-600" },
    amber: { box: "bg-amber-50 text-amber-800", dot: "bg-amber-600" },
    indigo: { box: "bg-brand-50 text-brand-800", dot: "bg-brand-600" },
    sky: { box: "bg-sky-50 text-sky-800", dot: "bg-sky-600" },
  };
  const c = colors[color];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${c.box}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
      {children}
    </span>
  );
}

export function InlineAlert({
  type = "info",
  title,
  action,
  children,
}: {
  type?: "info" | "success" | "warning" | "error";
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const styles = {
    info: { box: "border-brand-200 bg-brand-50 text-brand-900", Icon: IconInfo },
    success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: IconCheck },
    warning: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: IconAlert },
    error: { box: "border-red-200 bg-red-50 text-red-900", Icon: IconAlert },
  }[type];
  const { Icon } = styles;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${styles.box}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && (
          <div className={title ? "mt-0.5 text-sm leading-relaxed" : "leading-relaxed"}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

// Empty state with an optional call to action.
export function EmptyState({
  icon,
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {message && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse-soft rounded-md bg-slate-200 ${className}`} />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
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
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        aria-label="Acciones"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[180px] origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                item.danger
                  ? "text-red-700 hover:bg-red-50"
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
      className={`tabular ${className}`}
    >
      {timeSlots.map((t) => {
        const [h, m] = t.split(":").map(Number);
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return (
          <option key={t} value={t}>
            {`${t} (${h12}:${String(m).padStart(2, "0")} ${ampm})`}
          </option>
        );
      })}
    </Select>
  );
}

/* ------------------------------------------------------------------ *
 * Overlays
 * ------------------------------------------------------------------ */

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
  const titleId = useId();

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
      <div className="flex flex-none items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-bold tracking-tight text-slate-900">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 flex-none rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Cerrar"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex-none border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>
      )}
    </>
  );

  // `dvh` tracks the space browser chrome actually leaves, and `my-auto` keeps
  // the dialog centred while still letting the overlay scroll if it ever grows
  // taller than the window — with plain `items-center` the top would overflow
  // out of reach.
  const frameClass = `my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${maxWidth}`;

  return createPortal(
    <div
      ref={frameRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      {onSubmit ? (
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
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
          aria-labelledby={titleId}
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-xs leading-snug text-slate-500">{hint}</div>
      <div className="flex flex-none items-center gap-2">{children}</div>
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
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 ${
          selected ? "text-slate-900" : "text-slate-400"
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <IconChevronDown className="h-3.5 w-3.5 flex-none text-slate-400" />
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
                  {o.hint && <span className="text-xs text-slate-400">{o.hint}</span>}
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

/**
 * Large tap target for the primary actions on a landing screen.
 * Kept because it is a real button; the hover lift was removed from the
 * non-interactive tiles, not from this one.
 */
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
      className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40"
    >
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {badge}
        </div>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
    </button>
  );
}
