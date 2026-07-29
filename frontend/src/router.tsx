import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Lobby = lazy(() => import("./pages/Lobby"));
const Login = lazy(() => import("./pages/Login"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-20 text-slate-400">
          Cargando…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

// Picks the right dashboard for the logged-in user's role.
function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // A superadmin is an admin with tenant management on top, so they get the
  // admin dashboard (which carries the extra "tenants" section). Without this
  // they fell through to the student dashboard.
  if (user.role === "admin" || user.role === "superadmin") return <AdminDashboard />;
  if (user.role === "teacher") return <TeacherDashboard />;
  return <StudentDashboard />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <SuspenseWrapper><Login /></SuspenseWrapper> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <SuspenseWrapper><RoleHome /></SuspenseWrapper> },
      { path: "lobby/:sessionId", element: <SuspenseWrapper><Lobby /></SuspenseWrapper> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
