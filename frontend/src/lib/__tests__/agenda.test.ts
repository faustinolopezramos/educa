import { describe, expect, it } from "vitest";

import { durationHours, elapsedPct, gapLabel, phaseOf } from "../agenda";
import type { AgendaEntry } from "../types";

function clase(overrides: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    session_id: 1,
    schedule_id: 1,
    course_id: 1,
    course_name: "Inglés A1",
    level_name: "A1",
    date: "2026-09-22",
    start_time: "18:00:00",
    end_time: "20:00:00",
    status: "scheduled",
    register_closed: false,
    modality: "presencial",
    room_name: "Aula 1",
    teacher_id: 7,
    teacher_name: "Profe",
    students_total: 19,
    students_marked: 0,
    makeup_visitors: 0,
    can_close_register: true,
    ...overrides,
  };
}

const A_LAS = (h: number, m = 0) => h * 60 + m;

/**
 * El día del profesor se lee por el reloj: qué clase está dando ahora, cuál
 * dejó a medias y cuál no ha empezado. De ahí sale la única acción que la
 * pantalla ofrece en cada bloque.
 */
describe("phaseOf", () => {
  it("una clase en su franja horaria está en curso", () => {
    expect(phaseOf(clase(), A_LAS(19))).toBe("live");
    // Los bordes cuentan: a la hora en punto ya se está dando.
    expect(phaseOf(clase(), A_LAS(18))).toBe("live");
    expect(phaseOf(clase(), A_LAS(20))).toBe("live");
  });

  it("antes de empezar es la siguiente", () => {
    expect(phaseOf(clase(), A_LAS(17, 59))).toBe("next");
  });

  it("terminada y con la lista abierta queda pendiente, no en el historial", () => {
    expect(phaseOf(clase(), A_LAS(20, 1))).toBe("open");
  });

  it("con la lista cerrada ya no pide nada, aunque acabe de terminar", () => {
    expect(phaseOf(clase({ register_closed: true }), A_LAS(20, 1))).toBe("done");
  });

  it("una clase cancelada nunca está en curso ni pendiente", () => {
    expect(phaseOf(clase({ status: "cancelled" }), A_LAS(19))).toBe("done");
    expect(phaseOf(clase({ status: "cancelled" }), A_LAS(23))).toBe("done");
  });
});

describe("gapLabel", () => {
  it("no nombra los huecos cortos entre dos clases seguidas", () => {
    expect(gapLabel(0)).toBeNull();
    expect(gapLabel(30)).toBeNull();
  });

  it("nombra en horas los huecos que se notan", () => {
    expect(gapLabel(60)).toBe("una hora sin clase");
    expect(gapLabel(180)).toBe("3 horas sin clase");
  });
});

describe("elapsedPct", () => {
  it("sitúa la hora actual dentro de la clase", () => {
    expect(elapsedPct(clase(), A_LAS(19))).toBe(50);
  });

  it("no se sale de la clase por mucho que pase la hora", () => {
    expect(elapsedPct(clase(), A_LAS(6))).toBe(0);
    expect(elapsedPct(clase(), A_LAS(23))).toBe(100);
  });
});

describe("durationHours", () => {
  it("cuenta la duración en horas con un decimal", () => {
    expect(durationHours(clase())).toBe(2);
    expect(durationHours(clase({ start_time: "08:15:00", end_time: "09:00:00" }))).toBe(0.8);
  });
});
