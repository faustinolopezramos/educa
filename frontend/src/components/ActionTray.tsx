import { useSearchParams } from "react-router-dom";

import { useDashboard } from "../lib/queries";
import type { ActionItem } from "../lib/types";
import { Card, SectionHeading } from "./ui";
import { IconCheck, IconChevronRight } from "./icons";

/**
 * What is waiting on the signed-in user, at the top of their home screen.
 *
 * Every role's home used to open with counts — students, classes, attendance
 * rate — that were true and inert: nothing in them said what to do next. This
 * is the other half. Each row states the problem in the user's own vocabulary
 * and links to the section that resolves it, so nobody has to go looking for a
 * screen the summary already knew about.
 *
 * The API decides what belongs here, per role and per permission, so an
 * assistant without `manage_finance` is never told about money they cannot
 * touch.
 */

const SEVERITY_ORDER: Record<ActionItem["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_STYLES: Record<ActionItem["severity"], string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-slate-200 bg-slate-50",
};

const COUNT_STYLES: Record<ActionItem["severity"], string> = {
  critical: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  info: "bg-slate-500 text-white",
};

export function ActionTray({
  title = "Requiere tu atención",
  emptyMessage = "No hay nada pendiente. Todo al día.",
}: {
  title?: string;
  emptyMessage?: string;
}) {
  const { data, isLoading } = useDashboard();
  const [, setParams] = useSearchParams();

  // Nothing at all while loading: a tray that appears and then empties reads as
  // a problem that resolved itself, which is worse than arriving a beat late.
  if (isLoading) return null;

  const items = [...(data?.items ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  if (items.length === 0) {
    return (
      <Card padding="sm" className="mb-4">
        <div className="flex items-center gap-2.5 text-sm text-slate-500">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          {emptyMessage}
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-5">
      <SectionHeading>{title}</SectionHeading>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.kind}
            onClick={() => setParams({ m: item.section })}
            className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-slate-400 ${
              SEVERITY_STYLES[item.severity]
            }`}
          >
            <span
              className={`tabular mt-0.5 flex h-7 min-w-7 flex-none items-center justify-center rounded-lg px-1.5 text-sm font-bold ${
                COUNT_STYLES[item.severity]
              }`}
            >
              {item.count}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">
                {item.label}
                {item.amount != null && item.amount > 0 && (
                  <span className="tabular ml-1 font-bold">
                    · {item.amount.toFixed(2)}
                  </span>
                )}
              </span>
              {item.detail && (
                <span className="mt-0.5 block text-xs text-slate-600">{item.detail}</span>
              )}
            </span>

            <IconChevronRight className="mt-1 h-4 w-4 flex-none text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
