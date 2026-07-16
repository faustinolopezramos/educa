import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Toaster } from "./Toaster";
import { Button } from "./ui";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  teacher: "Profesor",
  student: "Alumno",
};

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand-600">Educa</span>
          <span className="text-sm text-slate-400">· Aula Virtual</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <NavItem to="/">Inicio</NavItem>
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-700">{user.full_name}</div>
            <div className="text-xs text-slate-400">{roleLabels[user.role]}</div>
          </div>
          <Button variant="secondary" onClick={logout}>
            Salir
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 ${
          isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
