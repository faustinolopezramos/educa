import { describe, expect, it } from "vitest";

import {
  ENROLLMENT_TRANSITIONS,
  allowedTransitions,
  formatBalance,
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

  it("treats certified and withdrawn as the end of the line", () => {
    expect(isTerminalStatus("certified")).toBe(true);
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
