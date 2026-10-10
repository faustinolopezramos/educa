import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { hasPlaceholders, LEGAL } from "../../legal/legalInfo";
import CookiePolicy from "../legal/CookiePolicy";
import PrivacyPolicy from "../legal/PrivacyPolicy";
import TermsOfService from "../legal/TermsOfService";

function renderPage(page: JSX.Element) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("legal pages", () => {
  it.each([
    ["Términos y Condiciones", <TermsOfService key="t" />],
    ["Política de Privacidad", <PrivacyPolicy key="p" />],
    ["Política de Cookies", <CookiePolicy key="c" />],
  ])("%s shows its title, version and links to the other two", (title, page) => {
    renderPage(page);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`versión ${LEGAL.version}`))).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Documentos legales" });
    expect(nav).toHaveTextContent("Términos y Condiciones");
    expect(nav).toHaveTextContent("Política de Privacidad");
    expect(nav).toHaveTextContent("Política de Cookies");
  });

  it("states that the internal receipts are not tax invoices", () => {
    renderPage(<TermsOfService />);
    expect(screen.getByText(/no son facturas ni documentos tributarios/)).toBeInTheDocument();
  });

  it("states the plan prices in quetzales from the plan catalog", () => {
    renderPage(<TermsOfService />);
    expect(screen.getByText(/Q199 al mes/)).toBeInTheDocument();
  });

  it("covers minors and keeps payment data away from teachers", () => {
    renderPage(<PrivacyPolicy />);
    expect(screen.getByRole("heading", { name: /menores de edad/ })).toBeInTheDocument();
    expect(screen.getByText(/no sus cuotas, saldos ni pagos/)).toBeInTheDocument();
  });

  it("lists every key EDUCA keeps in the browser", () => {
    renderPage(<CookiePolicy />);
    for (const key of ["educa_token, educa_refresh_token", "educa:attendance-queue:…", "educa_nav_collapsed", "educa_av_ok", "educa-oauth…"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  it("still has placeholders to fill before publishing", () => {
    // Recordatorio: cuando se rellenen los datos reales, esta prueba debe
    // cambiar a `false`.
    expect(hasPlaceholders()).toBe(true);
  });
});
