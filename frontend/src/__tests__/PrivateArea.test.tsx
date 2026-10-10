import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import * as AuthContext from "../auth/AuthContext";
import { PrivateArea } from "../router";

vi.mock("../auth/AuthContext");
vi.mock("../pages/LandingPage", () => ({ default: () => <p>Portada de EDUCA</p> }));
vi.mock("../components/Layout", () => ({ Layout: () => <p>Panel</p> }));

function withUser(user: unknown) {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(),
    hasPermission: vi.fn(),
    updateUser: vi.fn(),
  } as never);
}

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  return <p>Login (desde {from})</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/*" element={<PrivateArea />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrivateArea", () => {
  it("shows a visitor the EDUCA homepage at the root", async () => {
    withUser(null);
    renderAt("/");
    expect(await screen.findByText("Portada de EDUCA")).toBeInTheDocument();
  });

  it("sends a visitor to the login from a private page, remembering it", () => {
    withUser(null);
    renderAt("/clase/7");
    expect(screen.getByText("Login (desde /clase/7)")).toBeInTheDocument();
  });

  it("takes a signed-in person straight to their panel", () => {
    withUser({ id: 1, role: "admin" });
    renderAt("/");
    expect(screen.getByText("Panel")).toBeInTheDocument();
  });
});
