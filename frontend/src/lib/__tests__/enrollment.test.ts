import { describe, expect, it } from "vitest";

import {
  ENROLLMENT_TRANSITIONS,
  allowedTransitions,
  formatBalance,
  holdsSeat,
  isDelinquent,
  isTerminalStatus,
} from "../enrollment";
import type { EnrollmentStatus } from "../types";

/**
 * This table has to stay in step with the API's own
 * (`app/models/enums.py: ENROLLMENT_TRANSITIONS`). If they drift, the panel
 * starts offering moves the server refuses — the exact failure this replaced.
 */
describe("enrollment lifecycle", () => {
  it("offers a way forward from every live state", () => {
    for (const state of ["enrolled", "active", "inactive"] as EnrollmentStatus[]) {
      expect(ENROLLMENT_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });

  it("treats graduated and withdrawn as the end of the line", () => {
    expect(isTerminalStatus("graduated")).toBe(true);
    expect(isTerminalStatus("withdrawn")).toBe(true);
    expect(allowedTransitions("withdrawn")).toEqual(["withdrawn"]);
  });

  it("never offers a way back from a dropout", () => {
    // Coming back is a new matrícula with its own code, not a revived one.
    for (const state of Object.keys(ENROLLMENT_TRANSITIONS) as EnrollmentStatus[]) {
      expect(ENROLLMENT_TRANSITIONS[state]).not.toContain("enrolled");
    }
  });

  it("always keeps the current status selectable", () => {
    for (const state of Object.keys(ENROLLMENT_TRANSITIONS) as EnrollmentStatus[]) {
      expect(allowedTransitions(state)[0]).toBe(state);
    }
  });

  it("does not list a status twice", () => {
    for (const state of Object.keys(ENROLLMENT_TRANSITIONS) as EnrollmentStatus[]) {
      const options = allowedTransitions(state);
      expect(new Set(options).size).toBe(options.length);
    }
  });

  it("lets a paused enrollment be reactivated or dropped, nothing else", () => {
    expect(allowedTransitions("inactive").slice(1).sort()).toEqual([
      "active",
      "withdrawn",
    ]);
  });
});

describe("formatBalance", () => {
  it("reads a debt as money owed", () => {
    expect(formatBalance(300)).toBe("Debe 300.00");
  });

  it("reads an overpayment as credit rather than a negative debt", () => {
    expect(formatBalance(-50)).toBe("A favor 50.00");
  });

  it("treats a rounding-sized remainder as settled", () => {
    // Money is stored as a float, so 0.1 + 0.2 owed against 0.3 paid must not
    // show up as an outstanding balance at the front desk.
    expect(formatBalance(0.001)).toBe("Sin saldo");
    expect(formatBalance(0)).toBe("Sin saldo");
  });
});

/**
 * Mirrors `ENROLLMENT_OCCUPIES_SEAT` on the API — the set the register is built
 * from, and the only one the API accepts marks and scores against. The teacher's
 * class detail used to draw its roster from every enrollment the course ever
 * had, so a matrícula closed two terms ago appeared as a nameless `#42` row that
 * answered 409 on every tap.
 */
describe("holdsSeat", () => {
  it("seats whoever is inscrito or activo", () => {
    expect(holdsSeat("enrolled")).toBe(true);
    expect(holdsSeat("active")).toBe(true);
  });

  it("leaves out anyone the API would refuse a mark for", () => {
    expect(holdsSeat("inactive")).toBe(false);
    expect(holdsSeat("graduated")).toBe(false);
    expect(holdsSeat("withdrawn")).toBe(false);
  });
});

/**
 * Mirrors `student_is_solvent`. The student dashboard used to ask only about
 * `active`, so a student whose overdue fee sat on an *inscrito* or *pausado*
 * matrícula was believed solvent here while the API refused them their grades —
 * and every refusal came back as a red "no tienes permisos" toast.
 */
describe("isDelinquent", () => {
  it("counts an overdue fee on every enrollment that still owes", () => {
    for (const status of ["enrolled", "active", "inactive"] as const) {
      expect(isDelinquent({ status, payment_status: "overdue" })).toBe(true);
    }
  });

  it("forgives what is merely not due yet", () => {
    expect(isDelinquent({ status: "active", payment_status: "pending" })).toBe(false);
    expect(isDelinquent({ status: "active", payment_status: "paid" })).toBe(false);
  });

  it("stops counting a matrícula that was already closed out", () => {
    // Whatever a graduated or withdrawn course left owing is collected outside
    // this lifecycle, so it must not keep the student locked out of their notes.
    expect(isDelinquent({ status: "graduated", payment_status: "overdue" })).toBe(false);
    expect(isDelinquent({ status: "withdrawn", payment_status: "overdue" })).toBe(false);
  });
});
