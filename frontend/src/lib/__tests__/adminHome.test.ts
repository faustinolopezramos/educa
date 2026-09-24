import { describe, expect, it } from "vitest";

import { adminStatusLine } from "../adminHome";
import type { ActionItem } from "../types";

function item(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    kind: "payment_overdue",
    label: "matrícula en mora",
    count: 3,
    severity: "critical",
    section: "inicio",
    detail: null,
    amount: null,
    ...overrides,
  };
}

describe("adminStatusLine", () => {
  it("sin pendientes, lo dice sin más", () => {
    expect(adminStatusLine([])).toBe("Todo al día esta semana.");
  });

  it("un pendiente es una sola frase", () => {
    expect(adminStatusLine([item({ count: 3, label: "matrículas en mora" })])).toBe(
      "3 matrículas en mora.",
    );
  });

  it("dos pendientes se unen con \"y\"", () => {
    const items = [
      item({ count: 3, label: "matrículas en mora" }),
      item({ count: 8, label: "clases sin registrar" }),
    ];
    expect(adminStatusLine(items)).toBe("3 matrículas en mora y 8 clases sin registrar.");
  });

  it("tres o más pendientes cuentan el resto en vez de listarlos todos", () => {
    const items = [
      item({ count: 3, label: "matrículas en mora" }),
      item({ count: 8, label: "clases sin registrar" }),
      item({ count: 1, label: "curso a punto de llenarse" }),
    ];
    expect(adminStatusLine(items)).toBe(
      "3 matrículas en mora, 8 clases sin registrar y un pendiente más.",
    );
  });

  it("cuatro o más pendientes usan el plural del resto", () => {
    const items = [item(), item(), item(), item()];
    expect(adminStatusLine(items)).toContain("2 pendientes más.");
  });
});
