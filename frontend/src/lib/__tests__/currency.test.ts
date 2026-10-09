import { describe, expect, it } from "vitest";

import { currencySymbol, formatMoney } from "../currency";

describe("formatMoney", () => {
  it("writes the amount with the academy's symbol", () => {
    expect(formatMoney(1250, "GTQ")).toBe("Q1,250.00");
    expect(formatMoney(1250, "USD")).toBe("$1,250.00");
    expect(formatMoney(99.5, "CRC")).toBe("₡99.50");
  });

  it("puts the sign before the symbol", () => {
    expect(formatMoney(-40, "GTQ")).toBe("-Q40.00");
  });

  it("falls back to quetzales, or to the code for an unknown currency", () => {
    expect(formatMoney(10, undefined)).toBe("Q10.00");
    expect(currencySymbol("xyz")).toBe("XYZ");
  });
});
