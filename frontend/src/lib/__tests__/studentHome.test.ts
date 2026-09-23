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

  it("por encima de la hora, cuenta en horas", () => {
    expect(nextClassStatusLine(3 * 60 * 60_000, 0)).toBe("Tu próxima clase es en 3 horas.");
    expect(nextClassStatusLine(60 * 60_000, 0)).toBe("Tu próxima clase es en 1 hora.");
  });
});
