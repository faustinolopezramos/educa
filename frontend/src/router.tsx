import { createBrowserRouter, Navigate } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Lobby } from "./pages/Lobby";
import { Login } from "./pages/Login";
import { StudentDashboard } from "./pages/StudentDashboard";
import { TeacherDashboard } from "./pages/TeacherDashboard";

// Picks the right dashboard for the logged-in user's role.
function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <AdminDashboard />;
  if (user.role === "teacher") return <TeacherDashboard />;
  return <StudentDashboard />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <RoleHome /> },
      { path: "lobby/:meetingId", element: <Lobby /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
