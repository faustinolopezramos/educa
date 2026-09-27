import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { NotificationSettingsPanel } from "../NotificationSettingsPanel";
import { api } from "../../../lib/api";
import type { NotificationSettings } from "../../../lib/types";

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
    },
  };
});

const mockSettings: NotificationSettings = {
  whatsapp_enabled: true,
  whatsapp_mode: "managed",
  whatsapp_phone_number_id: "",
  whatsapp_token_masked: "",
  whatsapp_default_country_code: "502",
  email_enabled: true,
  push_enabled: true,
  triggers: {
    class_cancelled: true,
    class_rescheduled: true,
    at_risk_absences: true,
    assignment_reminder: true,
    payment_reminder: true,
  },
  students_with_whatsapp: 42,
  total_students: 50,
  messages_sent_30d: 128,
};

describe("NotificationSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockSettings } as never);
    vi.mocked(api.put).mockImplementation(async (_url, data) => ({
      data: {
        ...mockSettings,
        ...(data as Partial<NotificationSettings>),
      },
    } as never));
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        message: "Mensaje de prueba enviado exitosamente a 55551234",
      },
    } as never);
  });

  it("loads and displays settings and delivery statistics", async () => {
    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Notificaciones & WhatsApp")).toBeInTheDocument();
    });

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/de 50 alumnos/i)).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("Pasarela EDUCA")).toBeInTheDocument();
  });

  it("allows switching between managed and custom Meta WhatsApp mode", async () => {
    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Notificaciones & WhatsApp")).toBeInTheDocument();
    });

    // Switch to custom Meta mode tab
    const customTab = screen.getByRole("tab", {
      name: /Cuenta Propia/i,
    });
    fireEvent.click(customTab);

    // Should now show Meta configuration inputs
    expect(screen.getByText("WhatsApp Phone Number ID")).toBeInTheDocument();
    expect(screen.getByText("Token de Acceso Permanente (System User Token)")).toBeInTheDocument();
  });

  it("sends a live WhatsApp test message and shows feedback", async () => {
    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Notificaciones & WhatsApp")).toBeInTheDocument();
    });

    const testInput = screen.getByPlaceholderText(/5555 1234/i);
    fireEvent.change(testInput, { target: { value: "55551234" } });

    const sendTestButton = screen.getByRole("button", {
      name: /Enviar Prueba/i,
    });
    fireEvent.click(sendTestButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/notifications/settings/test-whatsapp",
        { phone: "55551234" }
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Mensaje de prueba enviado exitosamente a 55551234/i)
      ).toBeInTheDocument();
    });
  });

  it("saves updated configuration when clicking Guardar Configuración", async () => {
    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Guardar Configuración" })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "Guardar Configuración" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        "/notifications/settings",
        expect.objectContaining({
          whatsapp_enabled: true,
          whatsapp_mode: "managed",
          whatsapp_default_country_code: "502",
          email_enabled: true,
          push_enabled: true,
        })
      );
    });
  });
});
