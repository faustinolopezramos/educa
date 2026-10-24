import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../../test/utils";
import { HolidaysPanel } from "../HolidaysPanel";
import * as Queries from "../../../lib/queries";

vi.mock("../../../lib/queries", async () => {
  const actual = await vi.importActual("../../../lib/queries");
  return {
    ...actual,
    useHolidays: vi.fn(),
    useCreateHoliday: vi.fn(),
    useDeleteHoliday: vi.fn(),
  };
});

const mockHolidays = [
  { id: 1, date: "2026-12-25", name: "Navidad" },
  { id: 2, date: "2026-01-01", name: "Año Nuevo" },
];

describe("HolidaysPanel", () => {
  const mockDeleteMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Queries.useHolidays).mockReturnValue({
      data: mockHolidays,
      isLoading: false,
    } as any);

    vi.mocked(Queries.useCreateHoliday).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(Queries.useDeleteHoliday).mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
  });

  it("renders registered holidays table", () => {
    render(<HolidaysPanel />);
    expect(screen.getByText("Días festivos")).toBeInTheDocument();
    expect(screen.getByText("Navidad")).toBeInTheDocument();
    expect(screen.getByText("Año Nuevo")).toBeInTheDocument();
  });

  it("opens ConfirmDialog before deleting and only deletes upon confirmation", async () => {
    render(<HolidaysPanel />);

    // Open action menu for first holiday
    const actionButtons = screen.getAllByRole("button", { name: "Acciones" });
    fireEvent.click(actionButtons[0]);

    // Click delete option
    const deleteOption = screen.getByRole("menuitem", { name: "Eliminar día festivo" });
    fireEvent.click(deleteOption);

    // The mutation should NOT be called immediately without confirmation
    expect(mockDeleteMutate).not.toHaveBeenCalled();

    // Confirm dialog should be visible
    expect(screen.getByText(/¿Seguro que deseas eliminar el festivo/)).toBeInTheDocument();
    expect(screen.getByText("Navidad")).toBeInTheDocument();

    // Confirm deletion
    const confirmButton = screen.getByRole("button", { name: "Eliminar" });
    fireEvent.click(confirmButton);

    expect(mockDeleteMutate).toHaveBeenCalled();
  });
});
