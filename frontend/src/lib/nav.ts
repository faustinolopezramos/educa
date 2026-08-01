import type { Permission, Role, User } from "./types";

export interface NavItem {
  id: string;
  label: string;
  /** When set, Layout shows a live count badge next to the item. */
  badge?: "pending-locations";
  permission?: Permission;
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
    // The three entities an admin actually manages get a section each, so any
    // of them is one click away. They used to share a single "Usuarios" screen
    // where teachers and students were tabs, which put "edit a teacher" three
    // clicks deep and mixed two jobs that have nothing in common.
    label: "Gestión Académica",
    items: [
      { id: "courses", label: "Cursos" },
      { id: "teachers", label: "Profesores" },
      { id: "students", label: "Alumnos" },
      { id: "enrollments", label: "Matrículas" },
      { id: "reports", label: "Reportes" },
    ],
  },
  {
    label: "Cuentas",
    items: [{ id: "users", label: "Todas las cuentas" }],
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

const SUPERADMIN_GROUPS: NavGroup[] = [
  {
    label: "Plataforma SaaS",
    items: [
      { id: "tenants", label: "Gestión de Academias" },
      { id: "audit", label: "Auditoría Global" },
    ],
  },
  {
    label: "Cuenta",
    items: [{ id: "perfil", label: "Mi perfil" }],
  },
];

export const NAV: Record<Role, NavGroup[]> = {
  superadmin: SUPERADMIN_GROUPS,
  admin: ADMIN_GROUPS,
  assistant: ADMIN_GROUPS,
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
      label: "Mis estudios",
      items: [
        { id: "inicio", label: "Mi semana" },
        { id: "tareas", label: "Tareas" },
        { id: "progreso", label: "Mi progreso" },
      ],
    },
    {
      label: "Cuenta",
      items: [{ id: "perfil", label: "Mi perfil" }],
    },
  ],
};

export function canSeeSection(user: User | null, sectionId: string): boolean {
  if (!user) return false;
  if (user.role === "superadmin") {
    return sectionId === "tenants" || sectionId === "audit" || sectionId === "perfil";
  }
  // Tenant management is for superadmin only.
  if (sectionId === "tenants") return false;
  if (user.role !== "assistant") return true;

  const perms = new Set(user.permissions || []);
  if (sectionId === "inicio" || sectionId === "perfil") return true;
  if (sectionId === "users")
    return perms.has("manage_teachers") || perms.has("manage_students");
  if (sectionId === "teachers") return perms.has("manage_teachers");
  if (sectionId === "students") return perms.has("manage_students");
  if (sectionId === "courses" || sectionId === "schedules")
    return perms.has("manage_schedules") || perms.has("manage_catalog");
  if (sectionId === "pendientes") return perms.has("manage_schedules");
  if (sectionId === "enrollments")
    return perms.has("manage_enrollments") || perms.has("manage_finance");
  if (sectionId === "reports") return perms.has("view_reports");
  if (sectionId === "catalog" || sectionId === "rooms" || sectionId === "holidays")
    return perms.has("manage_catalog");
  // Meeting providers hang off the schedule a class is held on, which is the
  // permission the API gates them with.
  if (sectionId === "video_providers") return perms.has("manage_schedules");
  // Auditoría stays admin-only: it replays every change in the academy,
  // including those made by the people an assistant reports to.
  return false;
}

export function getNavForUser(user: User | null): NavGroup[] {
  if (!user) return [];
  if (user.role !== "assistant") return NAV[user.role];

  return ADMIN_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeSection(user, item.id)),
  })).filter((group) => group.items.length > 0);
}

export function defaultSection(role: Role): string {
  return NAV[role][0].items[0].id;
}
