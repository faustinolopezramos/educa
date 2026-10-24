import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { render as renderBare } from "@testing-library/react";
import { render, screen } from "../test/utils";
import { accessibilityViolations } from "../test/axe";
import { Button, Field, Input, Modal } from "../components/ui";
import MFAVerifyPage from "../pages/MFAVerify";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ verifyMFA: vi.fn() }),
}));

describe("accesibilidad (axe)", () => {
  it("un campo de formulario con etiqueta y error no tiene violaciones", async () => {
    const { container } = render(
      <form>
        <Field label="Correo" error="Falta el correo">
          <Input name="email" />
        </Field>
        <Button type="submit">Enviar</Button>
      </form>,
    );
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it("el modal es un diálogo con nombre accesible", async () => {
    render(
      <Modal onClose={() => {}} title="Registrar pago">
        <p>Contenido</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/registrar pago/i);
    expect(await accessibilityViolations(document.body)).toEqual([]);
  });

  it("la pantalla del segundo factor no tiene violaciones", async () => {
    const { container } = renderBare(
      <MemoryRouter initialEntries={[{ pathname: "/mfa", state: { tempToken: "x" } }]}>
        <MFAVerifyPage />
      </MemoryRouter>,
    );
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
