import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test/utils";
import { NotificationBell } from "../NotificationBell";
import * as queries from "../../lib/queries";

vi.mock("../../lib/queries");

const mockNotifications = [
  {
    id: 1,
    kind: "assignment_created",
    title: "Nueva tarea: Ensayo B2",
    body: "Tu profesor ha publicado una nueva tarea.",
    read_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    kind: "payment_receipt",
    title: "Pago registrado",
    body: "Se registró el pago de tu colegiatura.",
    read_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

describe("NotificationBell", () => {
  it("renders unread counter and opens dropdown with notification cards", async () => {
    const markReadSpy = vi.fn();
    vi.spyOn(queries, "useNotifications").mockReturnValue({ data: mockNotifications } as any);
    vi.spyOn(queries, "useUnreadCount").mockReturnValue({ data: 1 } as any);
    vi.spyOn(queries, "useMarkNotificationRead").mockReturnValue({ mutate: markReadSpy } as any);
    vi.spyOn(queries, "useMarkAllRead").mockReturnValue({ mutate: vi.fn() } as any);

    render(<NotificationBell />);

    expect(screen.getByText("1")).toBeInTheDocument();

    const bellBtn = screen.getByRole("button", { name: "Notificaciones" });
    fireEvent.click(bellBtn);

    expect(screen.getByText("Nueva tarea: Ensayo B2")).toBeInTheDocument();
    expect(screen.getByText("Pago registrado")).toBeInTheDocument();

    const unreadItem = screen.getByText("Nueva tarea: Ensayo B2").closest("li");
    expect(unreadItem).toBeInTheDocument();
    fireEvent.click(unreadItem!);

    expect(markReadSpy).toHaveBeenCalledWith(1);
  });
});
