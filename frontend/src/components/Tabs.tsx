import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

// Pill-style tab switcher (kept for any local grouping needs).
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              active === t.id
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.find((t) => t.id === active)?.content}
    </div>
  );
}
