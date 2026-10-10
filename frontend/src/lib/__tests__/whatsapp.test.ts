import { describe, expect, it } from "vitest";
import {
  buildWhatsAppUrl,
  cleanPhoneForWhatsApp,
  WHATSAPP_TEMPLATES,
} from "../whatsapp";

describe("cleanPhoneForWhatsApp", () => {
  it("cleans standard 8-digit Guatemala phone numbers and prefixes country code", () => {
    expect(cleanPhoneForWhatsApp("4123-4567")).toBe("50241234567");
    expect(cleanPhoneForWhatsApp("41234567")).toBe("50241234567");
  });

  it("handles numbers already with country code or plus sign", () => {
    expect(cleanPhoneForWhatsApp("+502 4123 4567")).toBe("50241234567");
    expect(cleanPhoneForWhatsApp("502-4123-4567")).toBe("50241234567");
  });

  it("returns empty string for null or empty input", () => {
    expect(cleanPhoneForWhatsApp(null)).toBe("");
    expect(cleanPhoneForWhatsApp(undefined)).toBe("");
    expect(cleanPhoneForWhatsApp("")).toBe("");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds wa.me link with encoded text", () => {
    const url = buildWhatsAppUrl("41234567", "Hola mundo");
    expect(url).toBe("https://wa.me/50241234567?text=Hola%20mundo");
  });

  it("returns empty string if phone is missing", () => {
    expect(buildWhatsAppUrl(null, "Hola")).toBe("");
  });
});

describe("WHATSAPP_TEMPLATES", () => {
  it("payment_reminder includes student name and balance", () => {
    const tmpl = WHATSAPP_TEMPLATES.find((t) => t.id === "payment_reminder")!;
    expect(tmpl).toBeDefined();
    const text = tmpl.buildText({
      studentName: "Carlos Gómez",
      balance: 350,
      currency: "Q",
      courseName: "Inglés B1",
      academyName: "Academia Educa",
    });
    expect(text).toContain("Carlos Gómez");
    expect(text).toContain("Q 350.00");
    expect(text).toContain("Inglés B1");
    expect(text).toContain("Academia Educa");
  });
});
