import { describe, it, expect } from "vitest";

import { render, screen } from "../../../test/utils";
import { FirstSteps } from "../FirstSteps";
import type { SetupStep } from "../../../lib/types";

const step = (key: string, done: boolean): SetupStep => ({
  key,
  label: `Paso ${key}`,
  hint: `Pista ${key}`,
  section: "catalog",
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
});
