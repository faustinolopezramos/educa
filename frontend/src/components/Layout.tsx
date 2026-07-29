import { useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { defaultSection, NAV, type NavItem } from "../lib/nav";
import { useLocationProposals } from "../lib/queries";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";
import { Toaster } from "./Toaster";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  teacher: "Profesor",
  student: "Alumno",
};

const ITEM_ICONS: Record<string, string> = {
  inicio: "🏠",
  clases: "🏠",
  courses: "📚",
  enrollments: "📝",
  users: "👥",
  reports: "📊",
  reportes: "📊",
  catalog: "🏛️",
  rooms: "🏫",
  video_providers: "📹",
  holidays: "📅",
  audit: "🛡️",
  tenants: "🏢",
  tareas: "📋",
  calificaciones: "🎓",
  perfil: "👤",
};

export function Layout() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("educa_nav_collapsed") === "true";
  });

  if (!user) return null;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("educa_nav_collapsed", String(next));
      return next;
    });
  }

  const groups = NAV[user.role] ?? [];
  const onHome = location.pathname === "/";
  const activeId = onHome ? (params.get("m") ?? defaultSection(user.role)) : "";

  // Find active label for header breadcrumb
  let activeLabel = "Inicio";
  for (const group of groups) {
    const found = group.items.find((i) => i.id === activeId);
    if (found) {
      activeLabel = found.label;
      break;
    }
  }

  return (
    <div className="flex min-h-full bg-slate-50/50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ---------- Sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-none flex-col bg-slate-900 text-slate-300 shadow-xl transition-all duration-300 ease-in-out lg:sticky lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-20" : "lg:w-64"} w-64`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/80">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-serif text-xl font-bold text-white shadow-md shadow-brand-600/30">
              E
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <span className="font-serif text-lg font-semibold tracking-tight text-white block leading-none truncate">
                  Educa
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block truncate">
                  Plataforma Académica
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <span className="text-sm font-bold">{collapsed ? "»" : "«"}</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <div className="px-3 pb-2 pt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                  {group.label}
                </div>
              ) : (
                <div className="h-px bg-slate-800/80 my-2 mx-1" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    collapsed={collapsed}
                    onClick={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800/80 p-3 bg-slate-950/40">
          <div className={`flex items-center gap-2.5 rounded-xl bg-slate-800/50 p-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-inner">
              {initials(user.full_name)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-100">
                  {user.full_name}
                </div>
                <div className="text-[10px] text-brand-400 font-medium truncate">{roleLabels[user.role]}</div>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 active:scale-98 ${
              collapsed ? "justify-center" : "justify-center"
            }`}
          >
            <span>{collapsed ? "🚪" : "Cerrar sesión"}</span>
          </button>
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 glass-panel px-4 py-3.5 lg:px-8 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200/60 active:scale-95 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú móvil"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              className="hidden lg:flex rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-900 active:scale-95"
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {collapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                )}
              </svg>
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
              <span className="text-slate-400 hidden sm:inline">Educa</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900">{activeLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openCommandPalette}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Buscar e ir a una sección"
            >
              <span>⌕</span>
              <span className="hidden sm:inline">Buscar…</span>
              <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 md:inline">
                ⌘K
              </kbd>
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {roleLabels[user.role]}
            </span>
            <NotificationBell />
          </div>
        </header>

        {/* Main Content Area - Max Width Expanded to 1600px */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-10 lg:py-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <Toaster />
    </div>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const icon = ITEM_ICONS[item.id] || "📌";
  return (
    <Link
      to={`/?m=${item.id}`}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all ${
        collapsed ? "justify-center px-2" : "px-3 justify-between"
      } ${
        active
          ? "bg-brand-600 font-semibold text-white shadow-sm shadow-brand-600/20"
          : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
      }`}
    >
      <div className="flex items-center gap-2.5 truncate">
        <span className="text-base leading-none">{icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </div>
      {!collapsed && item.badge === "pending-locations" && <PendingBadge active={active} />}
    </Link>
  );
}

// Live count of location proposals awaiting review (admin only).
function PendingBadge({ active }: { active: boolean }) {
  const { data: pending = [] } = useLocationProposals("pending");
  if (pending.length === 0) return null;
  return (
    <span
      className={`min-w-[20px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${
        active ? "bg-white/25 text-white" : "bg-amber-500 text-slate-950"
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

