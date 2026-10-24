import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { TeacherAssignmentModal } from "../TeacherAssignmentModal";
import { api } from "../../../lib/api";
import type { Course } from "../../../lib/types";

vi.mock("../../../lib/api");

const mockCourses: Course[] = [
  {
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
  },
];

describe("TeacherAssignmentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
  });

  it("auto-prepends https:// to resource URL without protocol", async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(
      <TeacherAssignmentModal
        courses={mockCourses}
        initialCourseId={10}
        onClose={onClose}
        onCreated={onCreated}
      />
    );

    // Fill title
    const titleInput = screen.getByLabelText(/Título de la Asignación/i);
    fireEvent.change(titleInput, { target: { value: "Tarea 1" } });

    // Fill resource URL without scheme
    const urlInput = screen.getByPlaceholderText(/https:\/\/drive\.google\.com/i);
    fireEvent.change(urlInput, { target: { value: "drive.google.com/folder/123" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Publicar Tarea/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/assignments",
        expect.objectContaining({
          course_id: 10,
          title: "Tarea 1",
          resource_url: "https://drive.google.com/folder/123",
        })
      );
      expect(onCreated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submits null when resource url is empty", async () => {
    render(
      <TeacherAssignmentModal
        courses={mockCourses}
        initialCourseId={10}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );

    const titleInput = screen.getByLabelText(/Título de la Asignación/i);
    fireEvent.change(titleInput, { target: { value: "Tarea 2" } });

    const submitBtn = screen.getByRole("button", { name: /Publicar Tarea/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/assignments",
        expect.objectContaining({
          title: "Tarea 2",
          resource_url: null,
        })
      );
    });
  });
});
