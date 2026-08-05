import { describe, expect, it } from "vitest";

import {
  courseModality,
  courseModalityLabel,
  locationSummary,
  needsLink,
  usesRoom,
} from "../format";
import type { Modality } from "../types";

const slot = (modality: Modality) => ({ modality });

/**
 * Espeja `MODALITY_USES_ROOM` y `MODALITY_NEEDS_LINK` de la API. Media docena de
 * pantallas preguntaban `=== "virtual"` para decidir si mostrar un enlace, de
 * modo que una clase semi presencial —que se da en el aula *y* en línea— nunca
 * enseñaba el suyo.
 */
describe("qué necesita cada modalidad", () => {
  it("semi presencial responde que sí a las dos", () => {
    expect(usesRoom("semi_presencial")).toBe(true);
    expect(needsLink("semi_presencial")).toBe(true);
  });

  it("presencial ocupa aula y no lleva enlace", () => {
    expect(usesRoom("presencial")).toBe(true);
    expect(needsLink("presencial")).toBe(false);
  });

  it("virtual lleva enlace y no ocupa aula", () => {
    expect(usesRoom("virtual")).toBe(false);
    expect(needsLink("virtual")).toBe(true);
  });
});

describe("courseModality", () => {
  it("es la de sus franjas cuando todas coinciden", () => {
    expect(courseModality([slot("virtual"), slot("virtual")])).toBe("virtual");
  });

  it("es «mixta» cuando no coinciden, que es información y no un error", () => {
    expect(courseModality([slot("presencial"), slot("virtual")])).toBe("mixta");
  });

  it("no inventa una modalidad para un curso sin franjas", () => {
    expect(courseModality([])).toBeNull();
  });

  it("una sola franja decide sin más", () => {
    expect(courseModality([slot("semi_presencial")])).toBe("semi_presencial");
  });
});

describe("courseModalityLabel", () => {
  it("nombra la mixta por su nombre", () => {
    expect(courseModalityLabel("mixta")).toBe("Modalidad mixta");
  });

  it("y el resto por el suyo", () => {
    expect(courseModalityLabel("semi_presencial")).toBe("Semi presencial");
  });
});

describe("locationSummary", () => {
  it("una virtual no menciona aula alguna", () => {
    expect(locationSummary("virtual", null)).toBe("Aula virtual");
  });

  it("una presencial es su aula, a secas", () => {
    expect(locationSummary("presencial", "Aula 3")).toBe("Aula 3");
  });

  it("una semi presencial se nombra, para no pasar por presencial", () => {
    expect(locationSummary("semi_presencial", "Aula 3")).toContain("Semi presencial");
    expect(locationSummary("semi_presencial", "Aula 3")).toContain("Aula 3");
  });

  it("dice que falta el aula en lugar de callarse", () => {
    expect(locationSummary("presencial", null)).toBe("aula por asignar");
  });
});
