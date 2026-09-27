import { describe, it, expect } from "vitest";

import { render, screen, fireEvent } from "../../../test/utils";
import { FirstSteps } from "../FirstSteps";
import type { SetupStep } from "../../../lib/types";

const step = (key: string, done: boolean, section = "catalog"): SetupStep => ({
  key,
  label: `Paso ${key}`,
  hint: `Pista ${key}`,
  section,
  done,
});

describe("FirstSteps", () => {
  it("points at the first step not yet done", () => {
    render(<FirstSteps steps={[step("a", true), step("b", false), step("c", false)]} />);
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    // Only the next step carries its hint and the button.
    expect(screen.getByText("Pista b")).toBeInTheDocument();
    expect(screen.queryByText("Pista c")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Empezar" })).toHaveLength(1);
  });

  it("disappears once everything is done", () => {
    const { container } = render(<FirstSteps steps={[step("a", true), step("b", true)]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("allows toggling minimized state to give admin breathing room", () => {
    render(<FirstSteps steps={[step("a", true), step("b", false)]} />);

    const minimizeBtn = screen.getByRole("button", { name: "Minimizar" });
    fireEvent.click(minimizeBtn);

    expect(screen.getByText("50% completado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar guía" })).toBeInTheDocument();

    // Clicking Continuar restores the expanded checklist
    fireEvent.click(screen.getByRole("button", { name: "Continuar guía" }));
    expect(screen.getByText("Pista b")).toBeInTheDocument();
  });

  it("shows template quick-loader buttons when active step is areas or levels", () => {
    render(<FirstSteps steps={[step("areas", false), step("levels", false)]} />);

    expect(
      screen.getByText("⚡ ¿Quieres ahorrar tiempo en la configuración?")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cargar Inglés/i })
    ).toBeInTheDocument();
  });

  it("offers direct CSV bulk import button when active step is students", () => {
    render(
      <FirstSteps
        steps={[
          step("areas", true),
          step("teachers", true),
          step("students", false, "students"),
        ]}
      />
    );

    expect(
      screen.getByRole("button", { name: "📥 Importar CSV" })
    ).toBeInTheDocument();
  });
});
