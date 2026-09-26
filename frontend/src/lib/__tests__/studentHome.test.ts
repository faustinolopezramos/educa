import { describe, expect, it } from "vitest";

import { nextClassStatusLine } from "../studentHome";

describe("nextClassStatusLine", () => {
  it("sin clases próximas, lo dice sin más", () => {
    expect(nextClassStatusLine(null, 0)).toBe("Hoy no tienes clases.");
  });

  it("una clase que ya empezó está en curso", () => {
    expect(nextClassStatusLine(1_000, 1_000)).toBe("Tu clase está en curso.");
    expect(nextClassStatusLine(1_000, 2_000)).toBe("Tu clase está en curso.");
  });

  it("por debajo de la hora, cuenta en minutos", () => {
    const now = 0;
    expect(nextClassStatusLine(40 * 60_000, now)).toBe("Tu próxima clase es en 40 minutos.");
    expect(nextClassStatusLine(60_000, now)).toBe("Tu próxima clase es en 1 minuto.");
  });

  it("una clase a menos de un minuto no dice 0 minutos", () => {
    expect(nextClassStatusLine(30_000, 0)).toBe("Tu próxima clase es en 1 minuto.");
  });

  it("pasada la hora, dice el día y la hora en vez de contar horas", () => {
    // Viernes 25 de septiembre de 2026, 20:00 (hora local).
    const now = new Date(2026, 8, 25, 20, 0).getTime();
    expect(nextClassStatusLine(new Date(2026, 8, 25, 22, 30).getTime(), now)).toBe(
      "Tu próxima clase es hoy a las 22:30.",
    );
    expect(nextClassStatusLine(new Date(2026, 8, 26, 8, 0).getTime(), now)).toBe(
      "Tu próxima clase es mañana a las 08:00.",
    );
    expect(nextClassStatusLine(new Date(2026, 8, 28, 8, 0).getTime(), now)).toBe(
      "Tu próxima clase es el lunes a las 08:00.",
    );
    expect(nextClassStatusLine(new Date(2026, 9, 12, 8, 0).getTime(), now)).toBe(
      "Tu próxima clase es el 12 de octubre a las 08:00.",
    );
  });
});
