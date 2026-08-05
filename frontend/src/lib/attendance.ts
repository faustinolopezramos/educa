import type { Attendance, AttendanceStatus } from "./types";

/**
 * Cómo una lista de marcas se convierte en una tasa de asistencia.
 *
 * Espeja `ATTENDANCE_IS_PRESENT` y `ATTENDANCE_COUNTS_TOWARD_RATE` de la API
 * (`app/models/enums.py`). Son dos preguntas distintas y hasta ahora cada sitio
 * respondía la suya: el reporte contaba la justificada como ausencia, el kardex
 * como asistencia y esta pantalla como ausencia otra vez — el mismo alumno tenía
 * tres tasas según dónde mirara.
 */

/** Vino a clase. Llegar tarde es haber venido. */
export const ATTENDANCE_IS_PRESENT: readonly AttendanceStatus[] = ["present", "late"];

/**
 * Entra en el cálculo.
 *
 * La justificada queda fuera de los dos lados: no es una asistencia que el
 * alumno no tuvo, pero tampoco una falta que deba penalizarle. De diez clases
 * con una justificada, su tasa sale sobre nueve.
 */
export const ATTENDANCE_COUNTS_TOWARD_RATE: readonly AttendanceStatus[] = [
  "present",
  "late",
  "absent",
];

export function isPresent(status: AttendanceStatus): boolean {
  return ATTENDANCE_IS_PRESENT.includes(status);
}

export function countsTowardRate(status: AttendanceStatus): boolean {
  return ATTENDANCE_COUNTS_TOWARD_RATE.includes(status);
}

/** La tasa 0..1, o `null` si no hay ninguna marca que cuente. */
export function attendanceRate(marks: AttendanceStatus[]): number | null {
  const counted = marks.filter(countsTowardRate);
  if (counted.length === 0) return null;
  return counted.filter(isPresent).length / counted.length;
}

/** La tasa en porcentaje entero, o `null`. */
export function attendancePct(marks: AttendanceStatus[]): number | null {
  const rate = attendanceRate(marks);
  return rate == null ? null : Math.round(rate * 100);
}

/**
 * Cuántas ausencias seguidas arrastra, de la más reciente hacia atrás.
 *
 * Es la señal que un profesor detecta antes que cualquier promedio: tres faltas
 * seguidas dicen más sobre un alumno a punto de abandonar que un 70% acumulado
 * que todavía se ve bien. Las justificadas no rompen la racha ni la alargan —
 * no dicen nada sobre si el alumno se está descolgando.
 */
export function absenceStreak(
  marks: { status: AttendanceStatus; order: number }[],
): number {
  const chronological = [...marks].sort((a, b) => b.order - a.order);
  let streak = 0;
  for (const mark of chronological) {
    if (mark.status === "excused") continue;
    if (mark.status === "absent") streak += 1;
    else break;
  }
  return streak;
}

/** Las marcas de un alumno en un curso, ordenadas por sesión. */
export function marksOf(
  attendance: Attendance[],
  enrollmentId: number,
): { status: AttendanceStatus; order: number }[] {
  return attendance
    .filter((a) => a.enrollment_id === enrollmentId)
    .map((a) => ({ status: a.status, order: a.session_id }));
}
