import { useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { defaultSection, NAV, type NavItem } from "../lib/nav";
import { useLocationProposals } from "../lib/queries";
import { NotificationBell } from "./NotificationBell";
import { Toaster } from "./Toaster";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  teacher: "Profesor",
  student: "Alumno",
};

export function Layout() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (!user) return null;

  const groups = NAV[user.role] ?? [];
  const onHome = location.pathname === "/";
  const activeId = onHome ? (params.get("m") ?? defaultSection(user.role)) : "";

  return (
    <div className="flex min-h-full">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ---------- Sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-60 flex-none flex-col bg-slate-900 text-slate-300 transition-transform lg:sticky lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link to="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-serif text-lg font-semibold text-white">
            E
          </span>
          <span className="font-semibold text-slate-50">Educa</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">
                {group.label}
              </div>
              {group.items.map((item) => (
                <SidebarLink key={item.id} item={item} active={item.id === activeId} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600/20 text-xs font-semibold text-brand-100">
              {initials(user.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-100">
                {user.full_name}
              </div>
              <div className="text-xs text-slate-500">{roleLabels[user.role]}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 backdrop-blur lg:justify-end lg:px-8">
          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <NotificationBell />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={`/?m=${item.id}`}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-brand-600 font-semibold text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      }`}
    >
      <span>{item.label}</span>
      {item.badge === "pending-locations" && <PendingBadge active={active} />}
    </Link>
  );
}

// Live count of location proposals awaiting review (admin only).
function PendingBadge({ active }: { active: boolean }) {
  const { data: pending = [] } = useLocationProposals("pending");
  if (pending.length === 0) return null;
  return (
    <span
      className={`min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold ${
        active ? "bg-white/25 text-white" : "bg-amber-600 text-white"
      }`}
    >
      {pending.length}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
