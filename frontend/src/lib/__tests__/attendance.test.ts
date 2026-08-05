import { describe, expect, it } from "vitest";

import {
  absenceStreak,
  attendancePct,
  attendanceRate,
  countsTowardRate,
  isPresent,
} from "../attendance";
import type { AttendanceStatus } from "../types";

/**
 * Espeja `ATTENDANCE_IS_PRESENT` y `ATTENDANCE_COUNTS_TOWARD_RATE` de la API.
 * Tres sitios calculaban esto por su cuenta y ninguno coincidía: el reporte
 * contaba la justificada como ausencia, el kardex como asistencia y el panel del
 * alumno como ausencia otra vez, así que el mismo alumno tenía tres tasas.
 */
describe("qué cuenta como asistencia", () => {
  it("llegar tarde es haber venido", () => {
    expect(isPresent("late")).toBe(true);
    expect(isPresent("present")).toBe(true);
  });

  it("la justificada queda fuera del cálculo entero", () => {
    expect(isPresent("excused")).toBe(false);
    expect(countsTowardRate("excused")).toBe(false);
  });

  it("la ausencia cuenta, y en contra", () => {
    expect(isPresent("absent")).toBe(false);
    expect(countsTowardRate("absent")).toBe(true);
  });
});

describe("attendanceRate", () => {
  const cases: [AttendanceStatus[], number | null][] = [
    [["present", "present", "present"], 1],
    [["present", "absent"], 0.5],
    [["present", "late"], 1],
    // De diez clases con una justificada, la tasa sale sobre nueve.
    [
      [
        "present", "present", "present", "present", "present",
        "present", "present", "present", "present", "excused",
      ],
      1,
    ],
    [["absent", "excused"], 0],
    // Sólo justificadas: no hay nada que promediar, y un 0% sería mentira.
    [["excused", "excused"], null],
    [[], null],
  ];

  it.each(cases)("%j → %s", (marks, expected) => {
    expect(attendanceRate(marks)).toBe(expected);
  });

  it("attendancePct redondea a entero", () => {
    expect(attendancePct(["present", "present", "absent"])).toBe(67);
    expect(attendancePct(["excused"])).toBeNull();
  });
});

/**
 * La racha es la señal que un profesor detecta antes que cualquier promedio:
 * tres faltas seguidas dicen más sobre alguien a punto de abandonar que un 70%
 * acumulado que todavía se ve bien.
 */
describe("absenceStreak", () => {
  function marks(...statuses: AttendanceStatus[]) {
    return statuses.map((status, i) => ({ status, order: i }));
  }

  it("cuenta hacia atrás desde la clase más reciente", () => {
    expect(absenceStreak(marks("present", "absent", "absent"))).toBe(3 - 1);
  });

  it("se corta en cuanto el alumno vuelve", () => {
    expect(absenceStreak(marks("absent", "absent", "present"))).toBe(0);
  });

  it("una justificada no rompe la racha ni la alarga", () => {
    // Faltó, avisó una vez, y volvió a faltar: siguen siendo dos ausencias
    // seguidas, no tres ni cero.
    expect(absenceStreak(marks("present", "absent", "excused", "absent"))).toBe(2);
  });

  it("no inventa racha donde no la hay", () => {
    expect(absenceStreak(marks("present", "present"))).toBe(0);
    expect(absenceStreak([])).toBe(0);
  });

  it("lee el orden real de las sesiones, no el del arreglo", () => {
    const unordered = [
      { status: "absent" as AttendanceStatus, order: 3 },
      { status: "present" as AttendanceStatus, order: 1 },
      { status: "absent" as AttendanceStatus, order: 2 },
    ];
    expect(absenceStreak(unordered)).toBe(2);
  });
});
