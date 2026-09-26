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
  phone: null,
  tax_id: null,
  address: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  active_students: 24,
  admins: 1,
  active_users: 17,
  ...over,
});

describe("TenantsPanel", () => {
  let updateMutate: ReturnType<typeof vi.fn>;
  let createMutate: ReturnType<typeof vi.fn>;

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
  });

  it("shows plan usage as enrollments against the limit", () => {
    withTenants([tenant()]);
    render(<TenantsPanel />);
    expect(screen.getByText("Matrículas activas")).toBeInTheDocument();
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
