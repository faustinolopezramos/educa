import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { defaultSection, getNavForUser, type NavItem } from "../lib/nav";
import { syncPushSubscription } from "../lib/push";
import { useDashboard, useLocationProposals } from "../lib/queries";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { QuickPayModal, OPEN_QUICK_PAY_EVENT } from "../features/enrollments/QuickPayModal";
import {
  IconBell,
  IconBook,
  IconBuilding,
  IconCalendar,
  IconCap,
  IconCash,
  IconChart,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconDoor,
  IconGlobe,
  IconGrid,
  IconHome,
  IconLayers,
  IconLogout,
  IconMenu,
  IconSearch,
  IconShield,
  IconUser,
  IconUsers,
  IconVideo,
} from "./icons";
import { NotificationBell } from "./NotificationBell";
import { Toaster } from "./Toaster";

const roleLabels: Record<string, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  assistant: "Asistente / Secretaría",
  teacher: "Profesor",
  student: "Alumno",
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ITEM_ICONS: Record<string, IconComponent> = {
  inicio: IconHome,
  hoy: IconHome,
  horarios: IconGrid,
  clases: IconBook,
  courses: IconBook,
  enrollments: IconClipboard,
  users: IconUsers,
  teachers: IconCap,
  students: IconUsers,
  nomina: IconCash,
  reports: IconChart,
  reportes: IconChart,
  catalog: IconLayers,
  rooms: IconDoor,
  video_providers: IconVideo,
  notifications_settings: IconBell,
  holidays: IconCalendar,
  audit: IconShield,
  tenants: IconBuilding,
  tareas: IconClipboard,
  calificaciones: IconCap,
  progreso: IconChart,
  perfil: IconUser,
};

export function Layout() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("educa_nav_collapsed") === "true",
  );

  // Si este dispositivo ya tenía avisos activados, quedan a nombre de quien entra.
  const userId = user?.id;
  useEffect(() => {
    if (userId) void syncPushSubscription();
  }, [userId]);

  const [quickPayState, setQuickPayState] = useState<{
    open: boolean;
    studentId?: number;
    enrollmentId?: number;
  }>({ open: false });

  useEffect(() => {
    function onOpenQuickPay(e: Event) {
      const detail = (e as CustomEvent).detail;
      setQuickPayState({
        open: true,
        studentId: detail?.studentId,
        enrollmentId: detail?.enrollmentId,
      });
    }
    document.addEventListener(OPEN_QUICK_PAY_EVENT, onOpenQuickPay);
    return () => document.removeEventListener(OPEN_QUICK_PAY_EVENT, onOpenQuickPay);
  }, []);

  if (!user) return null;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("educa_nav_collapsed", String(next));
      return next;
    });
  }

  const groups = getNavForUser(user);
  const onHome = location.pathname === "/";
  const activeId = onHome ? (params.get("m") ?? defaultSection(user.role)) : "";

  let activeLabel = "Inicio";
  for (const group of groups) {
    const found = group.items.find((i) => i.id === activeId);
    if (found) {
      activeLabel = found.label;
      break;
    }
  }

  const canFastPay =
    user.role === "admin" ||
    user.role === "superadmin" ||
    (user.role === "assistant" && (user.permissions || []).includes("manage_finance"));

  return (
    <div className="flex min-h-full">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ---------- Sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-none flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-transform duration-200 lg:sticky lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-[4.5rem]" : "lg:w-60"}`}
      >
        <div
          className={`flex h-14 flex-none items-center border-b border-slate-800 px-4 ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              E
            </span>
            {!collapsed && (
              <span className="truncate text-base font-bold tracking-tight text-white">
                Educa
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
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

        <div className="flex-none border-t border-slate-800 p-2.5">
          <div
            className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {initials(user.full_name)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-100">
                  {user.full_name}
                </div>
                <div className="truncate text-2xs text-slate-400">
                  {roleLabels[user.role]}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <IconLogout className="h-4 w-4 flex-none" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
          {!collapsed && (
            <Link
              to="/privacidad"
              className="mt-1 block px-2 text-2xs text-slate-500 hover:text-slate-300"
            >
              Privacidad y términos
            </Link>
          )}
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="-ml-1 rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            {/* One collapse control, not two. The sidebar used to carry its own
                chevron next to this one, both doing the same thing. */}
            <button
              className="-ml-1 hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:block"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            >
              {collapsed ? (
                <IconChevronRight className="h-4 w-4" />
              ) : (
                <IconChevronLeft className="h-4 w-4" />
              )}
            </button>
            <span className="truncate text-sm font-semibold text-slate-900">
              {activeLabel}
            </span>
          </div>

          <div className="flex flex-none items-center gap-1.5">
            {canFastPay && (
              <button
                onClick={() => setQuickPayState({ open: true })}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                title="Registrar cobro rápido en mostrador"
              >
                <IconCash className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cobro Rápido</span>
              </button>
            )}
            <button
              onClick={openCommandPalette}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              aria-label="Buscar e ir a una sección"
            >
              <IconSearch className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-2xs text-slate-400 md:inline">
                ⌘K
              </kbd>
            </button>
            <NotificationBell />
          </div>
        </header>

        <main
          className={`mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8 ${
            user.role === "student" || user.role === "teacher" ? "pb-24 lg:pb-8" : ""
          }`}
        >
          <Outlet />
        </main>
      </div>
      {user.role === "student" && <StudentBottomNav activeId={activeId} />}
      {user.role === "teacher" && <TeacherBottomNav activeId={activeId} />}
      {quickPayState.open && (
        <QuickPayModal
          initialStudentId={quickPayState.studentId}
          initialEnrollmentId={quickPayState.enrollmentId}
          onClose={() => setQuickPayState({ open: false })}
        />
      )}
      <CommandPalette />
      <Toaster />
    </div>
  );
}

function StudentBottomNav({ activeId }: { activeId: string }) {
  const { data: dash } = useDashboard();
  const pendingTasks =
    dash?.items.find((i) => i.kind === "pending_assignments")?.count ?? 0;

  const items = [
    { id: "inicio", label: "Mi semana", icon: IconHome },
    { id: "tareas", label: "Tareas", icon: IconClipboard, badge: pendingTasks },
    { id: "progreso", label: "Mi progreso", icon: IconChart },
    { id: "perfil", label: "Perfil", icon: IconUser },
  ];

  return (
    <nav
      aria-label="Navegación móvil del estudiante"
      className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 py-1 shadow-lg backdrop-blur-md lg:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          activeId === item.id ||
          (item.id === "progreso" &&
            (activeId === "calificaciones" ||
              activeId === "reportes" ||
              activeId === "kardex" ||
              activeId === "pagos"));

        return (
          <Link
            key={item.id}
            to={`/?m=${item.id}`}
            className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all ${
              isActive
                ? "text-brand-700 font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="relative">
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              {item.badge != null && item.badge > 0 ? (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-3xs font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
            </div>
            <span
              className={`mt-0.5 text-3xs tracking-tight ${
                isActive ? "font-bold text-brand-800" : "font-medium"
              }`}
            >
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-brand-600" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function TeacherBottomNav({ activeId }: { activeId: string }) {
  const { data: dash } = useDashboard();
  const pendingGrading =
    dash?.items.find((i) => i.kind === "pending_grading")?.count ?? 0;

  const items = [
    { id: "hoy", label: "Hoy", icon: IconHome },
    { id: "clases", label: "Clases", icon: IconBook },
    { id: "tareas", label: "Tareas", icon: IconClipboard, badge: pendingGrading },
    { id: "nomina", label: "Nómina", icon: IconCash },
    { id: "perfil", label: "Perfil", icon: IconUser },
  ];

  return (
    <nav
      aria-label="Navegación móvil del profesor"
      className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 py-1 shadow-lg backdrop-blur-md lg:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeId === item.id;

        return (
          <Link
            key={item.id}
            to={`/?m=${item.id}`}
            className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all ${
              isActive
                ? "text-brand-700 font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="relative">
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              {item.badge != null && item.badge > 0 ? (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-3xs font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
            </div>
            <span
              className={`mt-0.5 text-3xs tracking-tight ${
                isActive ? "font-bold text-brand-800" : "font-medium"
              }`}
            >
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-brand-600" />
            )}
          </Link>
        );
      })}
    </nav>
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
  const Icon = ITEM_ICONS[item.id] ?? IconGlobe;
  return (
    <Link
      to={`/?m=${item.id}`}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        collapsed ? "justify-center" : "justify-between"
      } ${
        active
          ? "bg-brand-600 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-[18px] w-[18px] flex-none" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </span>
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
      className={`min-w-[1.25rem] flex-none rounded-full px-1.5 py-0.5 text-center text-2xs font-bold ${
        active ? "bg-white/20 text-white" : "bg-amber-500 text-slate-900"
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
