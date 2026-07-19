import type { Role } from "./types";

export interface NavItem {
  id: string;
  label: string;
  /** When set, Layout shows a live count badge next to the item. */
  badge?: "pending-locations";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Role-aware navigation. The active section travels in the URL as `?m=<id>`,
// so the sidebar (Layout) and the page content (dashboards) stay in sync and
// sections are bookmarkable.
export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    {
      label: "Inicio",
      items: [
        { id: "inicio", label: "Resumen" },
        { id: "pendientes", label: "Pendientes", badge: "pending-locations" },
      ],
    },
    {
      label: "Académico",
      items: [
        { id: "courses", label: "Cursos" },
        { id: "catalog", label: "Catálogo" },
        { id: "schedules", label: "Horarios" },
        { id: "enrollments", label: "Matrículas" },
      ],
    },
    {
      label: "Personas",
      items: [
        { id: "users", label: "Usuarios" },
        { id: "teachers", label: "Profesores" },
      ],
    },
    {
      label: "Operación",
      items: [
        { id: "rooms", label: "Aulas" },
        { id: "holidays", label: "Festivos" },
        { id: "reports", label: "Reportes" },
        { id: "audit", label: "Auditoría" },
      ],
    },
  ],
  teacher: [
    {
      label: "Docencia",
      items: [
        { id: "clases", label: "Mis clases" },
        { id: "reportes", label: "Reporte" },
      ],
    },
  ],
  student: [
    {
      label: "Mi progreso",
      items: [
        { id: "inicio", label: "Mi semana" },
        { id: "calificaciones", label: "Calificaciones" },
        { id: "reportes", label: "Reporte" },
      ],
    },
  ],
};

export function defaultSection(role: Role): string {
  return NAV[role][0].items[0].id;
}
