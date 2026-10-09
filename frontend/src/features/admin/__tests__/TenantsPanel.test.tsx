import { describe, it, expect, vi, beforeEach } from "vitest";

import { render, screen, fireEvent } from "../../../test/utils";
import { TenantsPanel } from "../TenantsPanel";
import * as queries from "../../../lib/queries";
import type { Tenant } from "../../../lib/types";

vi.mock("../../../lib/queries");

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: 1,
  name: "Academia Alfa",
  slug: "alfa",
  logo_url: null,
  is_active: true,
  max_active_students: 100,
  timezone: "America/Guatemala",
  currency: "GTQ",
  phone: null,
  tax_id: null,
  address: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  active_students: 24,
  admins: 1,
  active_users: 17,
  plan_tier: "starter",
  requested_plan: null,
  plan_requested_at: null,
  ...over,
});

describe("TenantsPanel", () => {
  let updateMutate: ReturnType<typeof vi.fn>;
  let createMutate: ReturnType<typeof vi.fn>;
  let activateMutate: ReturnType<typeof vi.fn>;
  let rejectMutate: ReturnType<typeof vi.fn>;

  function withTenants(list: Tenant[]) {
    vi.mocked(queries.useTenants).mockReturnValue({ data: list, isLoading: false } as never);
  }

  beforeEach(() => {
    updateMutate = vi.fn();
    createMutate = vi.fn();
    vi.mocked(queries.useUpdateTenant).mockReturnValue({ mutate: updateMutate, isPending: false } as never);
    vi.mocked(queries.useCreateTenant).mockReturnValue({ mutate: createMutate, isPending: false } as never);
    vi.mocked(queries.useCreateTenantAdmin).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(queries.useTenantAdmins).mockReturnValue({ data: [], isLoading: false } as never);
    activateMutate = vi.fn();
    rejectMutate = vi.fn();
    vi.mocked(queries.useActivatePlan).mockReturnValue({ mutate: activateMutate, isPending: false } as never);
    vi.mocked(queries.useRejectPlanRequest).mockReturnValue({ mutate: rejectMutate, isPending: false } as never);
  });

  it("flags plan requests and activates the requested plan from its tab", () => {
    withTenants([tenant({ requested_plan: "pro", plan_requested_at: "2026-10-01T12:00:00Z" })]);
    render(<TenantsPanel />);
    expect(screen.getByText(/Una academia pidió un cambio de plan/)).toBeInTheDocument();
    expect(screen.getByText("Pide el plan Profesional")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Academia Alfa"));
    // Con una solicitud pendiente, la ficha abre directamente en «Plan».
    expect(screen.getByText(/Solicita: Profesional · 300 alumnos · Q995\/mes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activar Profesional" }));
    expect(activateMutate).toHaveBeenCalledWith({ tenantId: 1, plan: "pro" }, expect.anything());
  });

  it("rejects a plan request with the reason the academy will read", () => {
    withTenants([tenant({ requested_plan: "scale" })]);
    render(<TenantsPanel />);
    fireEvent.click(screen.getByText("Academia Alfa"));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.change(screen.getByLabelText("Motivo del rechazo"), { target: { value: "Sin pago" } });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    expect(rejectMutate).toHaveBeenCalledWith({ tenantId: 1, reason: "Sin pago" }, expect.anything());
  });

  it("shows plan usage as enrollments against the limit", () => {
    withTenants([tenant()]);
    render(<TenantsPanel />);
    expect(screen.getByText(/Alumnos activos/)).toBeInTheDocument();
    expect(screen.getByText("24 / 100")).toBeInTheDocument();
  });

  it("warns about an active academy nobody can run", () => {
    withTenants([tenant({ admins: 0 })]);
    render(<TenantsPanel />);
    expect(screen.getByText(/no tiene administrador/)).toBeInTheDocument();
    expect(screen.getByText("Sin administrador")).toBeInTheDocument();
  });

  it("asks before suspending and says how many people lose access", () => {
    withTenants([tenant()]);
    render(<TenantsPanel />);
    fireEvent.click(screen.getByText("Academia Alfa"));
    fireEvent.click(screen.getByRole("tab", { name: "Estado" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspender academia" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText("17 personas perderán el acceso ahora mismo.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Suspender academia" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: 1, is_active: false }, expect.anything());
  });

  it("derives the slug from the name when creating", () => {
    withTenants([]);
    render(<TenantsPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva academia" })[0]);
    fireEvent.change(screen.getByPlaceholderText("Ej. Academia Internacional"), {
      target: { value: "Academia Ñandú Central" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear y continuar" }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Academia Ñandú Central", slug: "academia-nandu-central" }),
      expect.anything(),
    );
  });
});
