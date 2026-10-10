import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen } from "../../../test/utils";
import * as queries from "../../../lib/queries";
import type { AcademyPlan } from "../../../lib/types";
import { PlanCard } from "../PlanCard";

vi.mock("../../../lib/queries");
vi.mock("../../../lib/toast");

const PLANS = [
  { code: "free", name: "Gratis", max_students: 15, monthly_price: "0" },
  { code: "starter", name: "Starter", max_students: 100, monthly_price: "199" },
  { code: "pro", name: "Profesional", max_students: 300, monthly_price: "499" },
  { code: "scale", name: "Escala", max_students: 1000, monthly_price: "999" },
];

const plan = (over: Partial<AcademyPlan> = {}): AcademyPlan => ({
  plan: "free",
  plan_name: "Gratis",
  max_active_students: 15,
  active_students: 12,
  requested_plan: null,
  plan_requested_at: null,
  currency: "GTQ",
  plans: PLANS,
  ...over,
});

describe("PlanCard", () => {
  let requestMutate: ReturnType<typeof vi.fn>;
  let cancelMutate: ReturnType<typeof vi.fn>;

  function withPlan(p: AcademyPlan) {
    vi.mocked(queries.useAcademyPlan).mockReturnValue({ data: p } as never);
  }

  beforeEach(() => {
    requestMutate = vi.fn();
    cancelMutate = vi.fn();
    vi.mocked(queries.useRequestPlan).mockReturnValue({ mutate: requestMutate, isPending: false } as never);
    vi.mocked(queries.useCancelPlanRequest).mockReturnValue({ mutate: cancelMutate, isPending: false } as never);
  });

  it("shows usage and warns when the academy nears its limit", () => {
    withPlan(plan());
    render(<PlanCard />);
    expect(screen.getByText("12 de 15")).toBeInTheDocument();
    expect(screen.getByText(/Te quedan 3 plazas/)).toBeInTheDocument();
  });

  it("says plainly when the limit is reached", () => {
    withPlan(plan({ active_students: 15 }));
    render(<PlanCard />);
    expect(screen.getByText(/Llegaste al límite/)).toBeInTheDocument();
  });

  it("requests a bigger plan, preselecting the next one that fits", () => {
    withPlan(plan());
    render(<PlanCard />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar de plan" }));
    expect(screen.getByRole("radio", { name: /Starter/ })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Profesional/ }));
    fireEvent.click(screen.getByRole("button", { name: "Solicitar plan" }));
    expect(requestMutate).toHaveBeenCalledWith("pro", expect.anything());
  });

  it("does not offer plans too small for the current students", () => {
    withPlan(plan({ plan: "pro", plan_name: "Profesional", max_active_students: 300, active_students: 120 }));
    render(<PlanCard />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar de plan" }));
    expect(screen.getByRole("radio", { name: /Starter/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Escala/ })).toBeEnabled();
  });

  it("shows a pending request and lets the admin cancel it", () => {
    withPlan(plan({ requested_plan: "pro", plan_requested_at: "2026-10-01T12:00:00Z" }));
    render(<PlanCard />);
    expect(screen.getByText("Solicitaste el plan Profesional")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar de plan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));
    expect(cancelMutate).toHaveBeenCalled();
  });
});
