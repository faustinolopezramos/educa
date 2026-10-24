import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { VideoProvidersPanel } from "../VideoProvidersPanel";
import { api } from "../../../lib/api";

vi.mock("../../../lib/api");

const mockProviders = [
  { id: 1, name: "zoom", is_active: true },
  { id: 2, name: "google", is_active: false },
];

describe("VideoProvidersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockProviders });
    vi.mocked(api.put).mockResolvedValue({ data: { name: "manual", is_active: true } });
  });

  it("loads and displays active provider from meetings API", async () => {
    render(<VideoProvidersPanel />);

    await waitFor(() => {
      expect(screen.getByText("ZOOM activo")).toBeInTheDocument();
    });

    // Zoom fields should be visible
    expect(screen.getByLabelText(/Account ID/i)).toBeInTheDocument();
  });

  it("allows switching to manual mode and saving", async () => {
    render(<VideoProvidersPanel />);

    await waitFor(() => {
      expect(screen.getByText("ZOOM activo")).toBeInTheDocument();
    });

    // Click Manual tab
    const manualTab = screen.getByRole("tab", { name: "Manual" });
    fireEvent.click(manualTab);

    // Click save button
    const revertBtn = screen.getByRole("button", { name: /Revertir y activar Modo Manual/i });
    fireEvent.click(revertBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        "/meetings/providers",
        expect.objectContaining({ name: "manual", is_active: true })
      );
    });
  });
});
