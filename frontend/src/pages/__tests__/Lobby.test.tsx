import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../test/utils";
import Lobby from "../Lobby";
import * as queries from "../../lib/queries";
import * as AuthContext from "../../auth/AuthContext";
import * as reactRouter from "react-router-dom";

vi.mock("../../lib/queries");
vi.mock("../../auth/AuthContext");
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof reactRouter>();
  return {
    ...actual,
    useParams: () => ({ sessionId: "42" }),
  };
});

const mockSession = {
  id: 42,
  schedule_id: 10,
  date: "2026-10-08",
  status: "held",
  topic: "Conversation & Pronunciation",
  recording_url: null,
};

const mockSchedule = {
  id: 10,
  course_id: 1,
  teacher_id: 5,
  room_id: null,
  day_of_week: 3,
  start_time: "10:00:00",
  end_time: "11:30:00",
  modality: "virtual" as const,
  join_url: "https://zoom.us/j/12345678",
};

const mockLobbyInfo = {
  can_join: true,
  join_url: "https://zoom.us/j/12345678",
  is_host: false,
};

describe("Lobby Flexible Access", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: { id: 100, role: "student", full_name: "María Gómez" },
      loading: false,
    } as any);

    vi.mocked(queries.useSession).mockReturnValue({
      data: mockSession,
      isLoading: false,
      isError: false,
    } as any);

    vi.mocked(queries.useSchedules).mockReturnValue({
      data: [mockSchedule],
      isLoading: false,
    } as any);

    vi.mocked(queries.useLobbyJoinInfo).mockReturnValue({
      data: mockLobbyInfo,
      isLoading: false,
    } as any);

    vi.mocked(queries.useEnrollments).mockReturnValue({
      data: [
        {
          id: 1,
          course_id: 1,
          student_id: 100,
          status: "active",
          attendance_blocked: false,
        },
      ],
      isLoading: false,
    } as any);
  });

  it("allows bypass of camera check and enables listener mode", async () => {
    render(<Lobby />);

    // Initial state without camera verified shows test prompt
    expect(
      screen.getByText("Prueba tu cámara y micrófono primero"),
    ).toBeInTheDocument();

    // Click listener mode bypass
    const bypassBtn = screen.getByText("¿No tienes cámara o micrófono? Entrar como oyente →");
    fireEvent.click(bypassBtn);

    // After bypass, button turns into listener mode and can join
    expect(
      screen.getByText("Entrar a la Clase Virtual (Modo Oyente) →"),
    ).toBeInTheDocument();
    expect(screen.getByText("Dispositivos omitidos (modo oyente activo)")).toBeInTheDocument();
  });
});
