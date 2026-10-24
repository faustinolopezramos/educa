import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import MFAVerifyPage from "../MFAVerify";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ verifyMFA: vi.fn() }),
}));

function renderAt(state?: object) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/mfa", state }]}>
      <MFAVerifyPage />
    </MemoryRouter>,
  );
}

describe("MFAVerify", () => {
  it("sends the user back to login when there is no challenge token", () => {
    renderAt();
    expect(screen.getByText(/Token temporal MFA no encontrado/i)).toBeInTheDocument();
  });

  it("asks for the code when a challenge token is present", () => {
    renderAt({ tempToken: "abc" });
    expect(screen.queryByText(/Token temporal MFA no encontrado/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verificar|continuar|confirmar/i })).toBeInTheDocument();
  });
});
