import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test/utils";
import LandingPage from "../LandingPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("LandingPage", () => {
  it("renders hero headline, trust badges and primary CTAs", () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/El sistema operativo para academias que elimina el caos/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Comenzar 14 Días Gratis →")).toBeInTheDocument();
    expect(screen.getByText("Listo en 15 min")).toBeInTheDocument();
    expect(screen.getByText("0% Comisiones")).toBeInTheDocument();
  });

  it("allows switching between Director, Profesores and Alumnos tabs", () => {
    render(<LandingPage />);

    // By default Director tab is active
    expect(
      screen.getByText("Sabe exactamente qué ocurre en tus aulas en tiempo real")
    ).toBeInTheDocument();

    // Click Profesores tab
    const teacherTab = screen.getByRole("button", {
      name: /Profesores & Calificación/i,
    });
    fireEvent.click(teacherTab);

    expect(
      screen.getByText("SpeedGrader: Califica 30 tareas en menos de 10 minutos")
    ).toBeInTheDocument();

    // Click Alumnos tab
    const studentTab = screen.getByRole("button", {
      name: /Alumnos & Entregas/i,
    });
    fireEvent.click(studentTab);

    expect(
      screen.getByText("Entregas seguras con confirmación y recibo inmutable")
    ).toBeInTheDocument();
  });

  it("renders the 4 pricing tiers including the free tier with CTA buttons", () => {
    render(<LandingPage />);

    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Profesional")).toBeInTheDocument();
    expect(screen.getByText("Escala")).toBeInTheDocument();

    const freeBtn = screen.getByRole("button", {
      name: /Comenzar Gratis/i,
    });
    fireEvent.click(freeBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/crear-academia?plan=free");

    const starterBtn = screen.getByRole("button", {
      name: /Elegir Starter/i,
    });
    fireEvent.click(starterBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/crear-academia?plan=starter");
  });

  it("opens and closes the demo modal", () => {
    render(<LandingPage />);

    const demoBtn = screen.getByText("Ver Demostración en Vivo");
    fireEvent.click(demoBtn);

    expect(
      screen.getByText("Demostración Guiada de Educa")
    ).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole("button", { name: "" }); // icon close
    fireEvent.click(closeBtn);

    expect(
      screen.queryByText("Demostración Guiada de Educa")
    ).not.toBeInTheDocument();
  });
});
