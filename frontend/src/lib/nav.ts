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
      { id: "enrollments", label: "Matrículas" },
      { id: "students", label: "Alumnos" },
      { id: "courses", label: "Cursos" },
      { id: "teachers", label: "Profesores" },
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
      { id: "catalog", label: "Estructura académica" },
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

// Sections a role may open that have no menu entry of their own. `schedules`
// and `pendientes` hang off the courses hub; the two student ids are the ones
// "Mi progreso" replaced, kept alive so an old bookmark still lands somewhere.
const EXTRA_SECTIONS: Partial<Record<Role, string[]>> = {
  admin: ["schedules", "pendientes"],
  assistant: ["schedules", "pendientes"],
  student: ["calificaciones", "reportes"],
};

function sectionsForRole(role: Role): Set<string> {
  return new Set([
    ...NAV[role].flatMap((group) => group.items.map((item) => item.id)),
    ...(EXTRA_SECTIONS[role] ?? []),
  ]);
}

/**
 * Whether `user` may open the section `sectionId`.
 *
 * Every role is answered on its own terms. This used to short-circuit with
 * `if (user.role !== "assistant") return true`, so it claimed a student could
 * open `audit` and a teacher `tenants`. Nothing broke — the dashboards only
 * mount their own sections and the API refuses the rest — but a guard that
 * answers "yes" to everything is a trap for whoever reaches for it next.
 */
export function canSeeSection(user: User | null, sectionId: string): boolean {
  if (!user) return false;
  // Tenant management is for superadmin only, whatever else a menu may list.
  if (sectionId === "tenants") return user.role === "superadmin";
  if (!sectionsForRole(user.role).has(sectionId)) return false;
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

/**
 * Whether `user` may create and grade work, rather than hand it in.
 *
 * Mirrors `require_staff_permission(manage_grades)` on the API — teacher, admin
 * and superadmin pass, an assistant only with the permission. The tareas panel
 * used to ask `role === "admin" || role === "teacher"`, which quietly showed a
 * superadmin the student's side of the screen: no way to set work, no roster,
 * just a "entregar" button for courses they are not enrolled in.
 */
export function canManageGrades(user: User | null): boolean {
  if (!user) return false;
  if (user.role === "student") return false;
  if (user.role === "assistant") {
    return (user.permissions || []).includes("manage_grades");
  }
  return true;
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
