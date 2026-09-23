import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useRouteError } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ClassMode = lazy(() => import("./pages/ClassMode"));
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
  if (user.role === "admin" || user.role === "superadmin" || user.role === "assistant")
    return <AdminDashboard />;
  if (user.role === "teacher") return <TeacherDashboard />;
  return <StudentDashboard />;
}

function RootBoundary() {
  const error = useRouteError();
  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold text-slate-800">Ocurrió un error inesperado</h1>
      <p className="mt-2 text-sm text-slate-600">
        {error instanceof Error ? error.message : "Error al cargar la página."}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Recargar página
      </button>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <SuspenseWrapper>
        <Login />
      </SuspenseWrapper>
    ),
    errorElement: <RootBoundary />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    errorElement: <RootBoundary />,
    children: [
      { index: true, element: <SuspenseWrapper><RoleHome /></SuspenseWrapper> },
      { path: "lobby/:sessionId", element: <SuspenseWrapper><Lobby /></SuspenseWrapper> },
      // Modo clase: pasar lista ocupa su propia pantalla, no una pestaña dentro
      // del panel, para que la clase en curso sea enlazable y no compita con el
      // resto del trabajo del profesor.
      { path: "clase/:sessionId", element: <SuspenseWrapper><ClassMode /></SuspenseWrapper> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
