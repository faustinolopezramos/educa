import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { TeacherSpeedGrader } from "../TeacherSpeedGrader";
import { api } from "../../../lib/api";
import type { Assignment, Course, RosterStudentStatus } from "../../../lib/types";

vi.mock("../../../lib/api");

const mockAssignment: Assignment = {
  id: 101,
  course_id: 10,
  title: "Ensayo Argumentativo de IA",
  description: "Escribe 500 palabras",
  due_date: "2026-10-30T23:59:00Z",
  created_at: "2026-10-20T10:00:00Z",
};

const mockCourse: Course = {
  id: 10,
  level_id: 1,
  name: "Inglés Avanzado",
  status: "in_progress",
  start_date: null,
  end_date: null,
  max_students: 20,
  passing_score: 70,
  seats_taken: 5,
  teacher_count: 1,
  schedule_count: 2,
};

const mockRoster: RosterStudentStatus[] = [
  {
    student_id: 1,
    full_name: "Ana García",
    status: "submitted",
    submission_id: 501,
    content: "Texto del ensayo de Ana",
    submitted_at: "2026-10-21T14:00:00Z",
  },
  {
    student_id: 2,
    full_name: "Bernardo López",
    status: "submitted",
    submission_id: 502,
    content: "Texto del ensayo de Bernardo",
    submitted_at: "2026-10-21T15:00:00Z",
  },
  {
    student_id: 3,
    full_name: "Carlos Méndez",
    status: "graded",
    submission_id: 503,
    score: 9.5,
    feedback: "Muy buen trabajo",
  },
];

describe("TeacherSpeedGrader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
  });

  it("renders active student submission and quick feedback tags", () => {
    render(
      <TeacherSpeedGrader
        assignment={mockAssignment}
        course={mockCourse}
        roster={mockRoster}
        onClose={vi.fn()}
        onGraded={vi.fn()}
      />
    );

    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("Texto del ensayo de Ana")).toBeInTheDocument();
    expect(screen.getByText("+ ¡Excelente trabajo! 👏")).toBeInTheDocument();
  });

  it("saves grade and advances without skipping next student in pending filter", async () => {
    const onGraded = vi.fn();
    const { rerender } = render(
      <TeacherSpeedGrader
        assignment={mockAssignment}
        course={mockCourse}
        roster={mockRoster}
        onClose={vi.fn()}
        onGraded={onGraded}
      />
    );

    // Click Guardar y Siguiente
    const saveAndNextBtn = screen.getByText("Guardar y Siguiente →");
    fireEvent.click(saveAndNextBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/assignments/submissions/501",
        expect.objectContaining({ score: 10 })
      );
      expect(onGraded).toHaveBeenCalled();
    });

    // When parent refetches, student 1 becomes "graded"
    const updatedRoster: RosterStudentStatus[] = [
      {
        ...mockRoster[0],
        status: "graded",
        score: 10,
      },
      mockRoster[1],
      mockRoster[2],
    ];

    rerender(
      <TeacherSpeedGrader
        assignment={mockAssignment}
        course={mockCourse}
        roster={updatedRoster}
        onClose={vi.fn()}
        onGraded={onGraded}
      />
    );

    // The active student in pending filter should now seamlessly be Bernardo López (not skipped!)
    expect(screen.getByText("Bernardo López")).toBeInTheDocument();
    expect(screen.getByText("Texto del ensayo de Bernardo")).toBeInTheDocument();
  });

  it("allows switching filter tab to view all students", () => {
    render(
      <TeacherSpeedGrader
        assignment={mockAssignment}
        course={mockCourse}
        roster={mockRoster}
        onClose={vi.fn()}
        onGraded={vi.fn()}
      />
    );

    // Tab "Todos"
    const allTab = screen.getByRole("button", { name: /Todos/ });
    fireEvent.click(allTab);

    expect(screen.getByText("de 3")).toBeInTheDocument();
  });
});
