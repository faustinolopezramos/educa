import type { EnrollmentStatus } from "./types";

/**
 * Which states each state may move to — the same table the API enforces
 * (`app/models/enums.py: ENROLLMENT_TRANSITIONS`).
 *
 * `certified` and `withdrawn` are terminal: a certificate has been issued
 * against the first, and re-admitting a student who dropped out is a *new*
 * matrícula with its own code, not a resurrection of the old one.
 *
 * The panel used to offer all five states from every state, so half the options
 * in the dropdown were moves the API would refuse — the user found out by
 * picking one and reading an error.
 */
export const ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  enrolled: ["active", "inactive", "withdrawn"],
  active: ["inactive", "certified", "withdrawn"],
  inactive: ["active", "withdrawn"],
  certified: [],
  withdrawn: [],
};

/** The options to offer for an enrollment currently in `current`.
 *  Always includes `current` itself, so the select has something selected. */
export function allowedTransitions(current: EnrollmentStatus): EnrollmentStatus[] {
  return [current, ...ENROLLMENT_TRANSITIONS[current]];
}

/** True when the lifecycle has ended and the status can no longer be changed. */
export function isTerminalStatus(status: EnrollmentStatus): boolean {
  return ENROLLMENT_TRANSITIONS[status].length === 0;
}

/**
 * Whether the student is still *in* this course.
 *
 * Mirrors `ENROLLMENT_HAS_ACCESS` on the API. "Mis cursos" used to list every
 * enrollment the student had ever held, so a course they dropped two terms ago
 * sat next to the one they attend on Tuesday, with the same weight and the same
 * progress ring.
 */
export function isCurrentEnrollment(status: EnrollmentStatus): boolean {
  return status === "enrolled" || status === "active";
}

/**
 * Whether this enrollment holds a seat in the course.
 *
 * Mirrors `ENROLLMENT_OCCUPIES_SEAT` on the API — the set the register and the
 * gradebook are built from, and the only one the API accepts marks and scores
 * against. Deliberately its own function rather than an alias of
 * `isCurrentEnrollment`, for the same reason the backend keeps the two sets
 * apart: "sits in this class" and "may reach this class" are different
 * questions that the business may well want to move independently.
 */
export function holdsSeat(status: EnrollmentStatus): boolean {
  return status === "enrolled" || status === "active";
}

/**
 * Whether this enrollment is what makes a student delinquent.
 *
 * Mirrors `student_is_solvent` on the API: an *overdue* fee on an enrollment
 * that still carries a live obligation (`ENROLLMENT_OWES` — inscrito, activo or
 * pausado). Checking only `active`, as the student dashboard used to, missed
 * the other two and let the UI believe a student was solvent while the API
 * refused them their grades.
 */
export function isDelinquent(enrollment: {
  status: EnrollmentStatus;
  payment_status: string;
}): boolean {
  return (
    enrollment.payment_status === "overdue" &&
    (enrollment.status === "enrolled" ||
      enrollment.status === "active" ||
      enrollment.status === "inactive")
  );
}

/** How money owed reads in the UI: positive is a debt, negative is credit. */
export function formatBalance(balance: number): string {
  if (Math.abs(balance) < 0.005) return "Sin saldo";
  if (balance < 0) return `A favor ${Math.abs(balance).toFixed(2)}`;
  return `Debe ${balance.toFixed(2)}`;
}
