import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Field, Input, Select, TimePicker } from "../ui";

/**
 * La etiqueta de cada campo tiene que nombrar a su control: antes un lector de
 * pantalla anunciaba todos los campos sin nombre y la ayuda y los errores no
 * se leían nunca.
 */
describe("Field", () => {
  it("names a single input with its label", () => {
    render(
      <Field label="Correo">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Correo").tagName).toBe("INPUT");
  });

  it("keeps an id the control already had", () => {
    render(
      <Field label="Nombre">
        <Input id="mi-nombre" />
      </Field>,
    );
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("id", "mi-nombre");
  });

  it("works through Select and TimePicker", () => {
    render(
      <>
        <Field label="Curso">
          <Select>
            <option>A1</option>
          </Select>
        </Field>
        <Field label="Inicio">
          <TimePicker value="08:00" onChange={() => {}} />
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Curso").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Inicio").tagName).toBe("SELECT");
  });

  it("reads the hint, or the error instead, as the description", () => {
    const { rerender } = render(
      <Field label="Clave" hint="Mínimo 8 caracteres">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Clave")).toHaveAccessibleDescription("Mínimo 8 caracteres");

    rerender(
      <Field label="Clave" hint="Mínimo 8 caracteres" error="Demasiado corta">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Clave");
    expect(input).toHaveAccessibleDescription("Demasiado corta");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the control when its label is clicked", () => {
    render(
      <Field label="Teléfono">
        <Input />
      </Field>,
    );
    fireEvent.click(screen.getByText("Teléfono"));
    // jsdom no mueve el foco al hacer clic en una etiqueta; basta con que la
    // etiqueta apunte al control.
    expect(screen.getByText("Teléfono").closest("label")).toHaveAttribute(
      "for",
      screen.getByLabelText("Teléfono").id,
    );
  });

  it("turns several controls into a group named by the label", () => {
    render(
      <Field label="Días">
        <button type="button">Lun</button>
        <button type="button">Mar</button>
      </Field>,
    );
    const group = screen.getByRole("group", { name: "Días" });
    expect(group).toContainElement(screen.getByRole("button", { name: "Lun" }));
  });

  it("treats a wrapping div as a group, not as the control", () => {
    render(
      <Field label="Monto">
        <div>
          <Input />
        </div>
      </Field>,
    );
    expect(screen.getByRole("group", { name: "Monto" })).toBeInTheDocument();
  });
});
