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
// Every section an admin has. A superadmin gets these too, plus tenant
// management — the roles are a superset, not two parallel menus, which is why
// this list is shared instead of duplicated.
const ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [
      { id: "inicio", label: "Resumen" },
    ],
  },
  {
    label: "Gestión Operativa",
    items: [
      { id: "courses", label: "Cursos" },
      { id: "enrollments", label: "Matrículas" },
      { id: "users", label: "Usuarios" },
      { id: "reports", label: "Reportes" },
    ],
  },
  {
    label: "Configuración del sistema",
    items: [
      { id: "catalog", label: "Estructura e Idiomas" },
      { id: "rooms", label: "Aulas" },
      { id: "video_providers", label: "Videoconferencias" },
      { id: "holidays", label: "Festivos" },
      { id: "audit", label: "Auditoría" },
    ],
  },
  {
    label: "Cuenta",
    items: [{ id: "perfil", label: "Mi perfil" }],
  },
];

export const NAV: Record<Role, NavGroup[]> = {
  superadmin: [
    {
      label: "Gestión SaaS",
      items: [{ id: "tenants", label: "Academias / Tenants" }],
    },
    ...ADMIN_GROUPS,
  ],
  admin: ADMIN_GROUPS,
  teacher: [
    {
      label: "Docencia",
      items: [
        { id: "clases", label: "Mis clases" },
        { id: "tareas", label: "Tareas" },
        { id: "reportes", label: "Reporte" },
      ],
    },
    {
      label: "Cuenta",
      items: [{ id: "perfil", label: "Mi perfil" }],
    },
  ],
  student: [
    {
      label: "Mi progreso",
      items: [
        { id: "inicio", label: "Mi semana" },
        { id: "tareas", label: "Tareas" },
        { id: "calificaciones", label: "Calificaciones" },
        { id: "reportes", label: "Reporte" },
      ],
    },
    {
      label: "Cuenta",
      items: [{ id: "perfil", label: "Mi perfil" }],
    },
  ],
};

export function defaultSection(role: Role): string {
  return NAV[role][0].items[0].id;
}
