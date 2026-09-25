import { describe, expect, it } from "vitest";

import { canManageGrades, canSeeSection, defaultSection, getNavForUser } from "../nav";
import type { Permission, Role, User } from "../types";

function user(role: Role, permissions: Permission[] = []): User {
  return {
    id: 1,
    email: "x@test.com",
    full_name: "Test User",
    role,
    timezone: "UTC",
    max_weekly_hours: null,
    phone: null,
    notify_email: true,
    notify_whatsapp: false,
    address: null,
    nationality_id: null,
    is_active: true,
    permissions,
  };
}

/**
 * `canSeeSection` is the single rule the sidebar and the router both answer to.
 * Hiding an item from the menu was never enough on its own: the section travels
 * in the URL, so an assistant who typed `?m=audit` mounted the panel anyway and
 * watched it fill with 403s.
 */
describe("canSeeSection", () => {
  it("keeps the audit trail out of every assistant's reach", () => {
    const everything: Permission[] = [
      "manage_teachers",
      "manage_students",
      "manage_catalog",
      "manage_schedules",
      "manage_enrollments",
      "manage_finance",
      "manage_grades",
      "view_reports",
    ];
    expect(canSeeSection(user("assistant", everything), "audit")).toBe(false);
    expect(canSeeSection(user("admin"), "audit")).toBe(true);
  });

  it("keeps tenant management to the superadmin", () => {
    expect(canSeeSection(user("admin"), "tenants")).toBe(false);
    expect(canSeeSection(user("superadmin"), "tenants")).toBe(true);
    expect(canSeeSection(user("assistant", ["manage_catalog"]), "tenants")).toBe(false);
  });

  it("opens rooms and holidays with manage_catalog, and not without it", () => {
    const withCatalog = user("assistant", ["manage_catalog"]);
    const without = user("assistant", ["manage_finance"]);
    for (const section of ["rooms", "holidays", "catalog"]) {
      expect(canSeeSection(withCatalog, section)).toBe(true);
      expect(canSeeSection(without, section)).toBe(false);
    }
  });

  it("opens the user directory only to the two people permissions", () => {
    expect(canSeeSection(user("assistant", ["manage_students"]), "users")).toBe(true);
    expect(canSeeSection(user("assistant", ["manage_teachers"]), "users")).toBe(true);
    // Handling money is not a licence to read every account in the academy.
    expect(canSeeSection(user("assistant", ["manage_finance"]), "users")).toBe(false);
  });

  it("always lets anyone reach their own home and profile", () => {
    const bare = user("assistant", []);
    expect(canSeeSection(bare, "inicio")).toBe(true);
    expect(canSeeSection(bare, "perfil")).toBe(true);
  });

  it("refuses an unknown section for an assistant rather than falling open", () => {
    expect(canSeeSection(user("assistant", ["manage_catalog"]), "algo_nuevo")).toBe(false);
  });

  it("refuses everything when nobody is signed in", () => {
    expect(canSeeSection(null, "inicio")).toBe(false);
  });

  // It used to short-circuit with `if (role !== "assistant") return true`, so it
  // cheerfully claimed a student could open the audit trail. Nothing broke —
  // the dashboards only mount their own sections — but a guard that answers yes
  // to everything is a trap for whoever reaches for it next.
  it("answers a teacher and a student on their own terms, not with a blanket yes", () => {
    const teacher = user("teacher");
    const student = user("student");

    expect(canSeeSection(teacher, "clases")).toBe(true);
    expect(canSeeSection(student, "progreso")).toBe(true);

    for (const section of ["audit", "users", "enrollments", "rooms", "tenants"]) {
      expect(canSeeSection(teacher, section)).toBe(false);
      expect(canSeeSection(student, section)).toBe(false);
    }
    // Neither one owns the other's sections either.
    expect(canSeeSection(teacher, "progreso")).toBe(false);
    expect(canSeeSection(student, "clases")).toBe(false);
  });

  it("still honours the two section ids 'Mi progreso' replaced", () => {
    // Old bookmarks have to land somewhere rather than on a denial.
    for (const legacy of ["calificaciones", "reportes"]) {
      expect(canSeeSection(user("student"), legacy)).toBe(true);
    }
  });
});

/**
 * Mirrors `require_staff_permission(manage_grades)` on the API. The tareas panel
 * asked `role === "admin" || role === "teacher"`, which quietly showed a
 * superadmin the student's half of the screen: no way to set work, no roster,
 * just a "entregar" button for courses they are not enrolled in.
 */
describe("canManageGrades", () => {
  it("covers every staff role the API lets through", () => {
    expect(canManageGrades(user("teacher"))).toBe(true);
    expect(canManageGrades(user("admin"))).toBe(true);
    expect(canManageGrades(user("superadmin"))).toBe(true);
  });

  it("holds an assistant to the permission itself", () => {
    expect(canManageGrades(user("assistant", ["manage_grades"]))).toBe(true);
    expect(canManageGrades(user("assistant", ["manage_finance"]))).toBe(false);
    expect(canManageGrades(user("assistant", []))).toBe(false);
  });

  it("never puts a student on the staff side", () => {
    expect(canManageGrades(user("student"))).toBe(false);
    expect(canManageGrades(null)).toBe(false);
  });
});

describe("getNavForUser", () => {
  it("shows an assistant only the sections they can actually open", () => {
    const nav = getNavForUser(user("assistant", ["manage_finance", "manage_enrollments"]));
    const ids = nav.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toContain("enrollments");
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("audit");
  });

  it("never renders an empty group", () => {
    const nav = getNavForUser(user("assistant", ["manage_finance"]));
    for (const group of nav) expect(group.items.length).toBeGreaterThan(0);
  });

  it("agrees with canSeeSection on every item it renders", () => {
    // The menu and the router must not drift: anything offered has to open.
    for (const perms of [
      ["manage_catalog"],
      ["manage_students", "view_reports"],
      ["manage_schedules"],
    ] as Permission[][]) {
      const u = user("assistant", perms);
      for (const group of getNavForUser(u)) {
        for (const item of group.items) {
          expect(canSeeSection(u, item.id)).toBe(true);
        }
      }
    }
  });

  it("gives every role a landing section that role may open", () => {
    for (const role of ["superadmin", "admin", "teacher", "student"] as Role[]) {
      const section = defaultSection(role);
      expect(section).toBeTruthy();
      expect(canSeeSection(user(role), section)).toBe(true);
    }
  });
});
