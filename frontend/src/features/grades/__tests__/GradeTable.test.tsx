import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../../test/utils";
import { GradeTable } from "../GradeTable";
import * as queries from "../../../lib/queries";
import type { Enrollment, Grade, UserBrief } from "../../../lib/types";

vi.mock("../../../lib/queries");

const mockEnrollments: Enrollment[] = [
  {
    id: 101,
    student_id: 1,
    course_id: 10,
    enrollment_code: "ENR-101",
    status: "active",
    payment_status: "paid",
    attendance_blocked: false,
    amount: 100,
    balance: 0,
  },
  {
    id: 102,
    student_id: 2,
    course_id: 10,
    enrollment_code: "ENR-102",
    status: "active",
    payment_status: "paid",
    attendance_blocked: false,
    amount: 100,
    balance: 0,
  },
];

const mockStudents: UserBrief[] = [
  { id: 1, full_name: "Ana García" },
  { id: 2, full_name: "Carlos López" },
];

const mockGrades: Grade[] = [
  {
    id: 1,
    enrollment_id: 101,
    evaluation_name: "Midterm Exam",
    score: 8.5,
    session_id: null,
    skill: "reading",
  },
  {
    id: 2,
    enrollment_id: 102,
    evaluation_name: "Midterm Exam",
    score: 7.0,
    session_id: null,
    skill: "reading",
  },
];

describe("GradeTable spreadsheet navigation", () => {
  beforeEach(() => {
    vi.mocked(queries.useGrades).mockReturnValue({
      data: mockGrades,
    } as any);

    vi.mocked(queries.useCreateGrade).mockReturnValue({
      mutate: vi.fn(),
    } as any);

    vi.mocked(queries.useUpdateGrade).mockReturnValue({
      mutate: vi.fn(),
    } as any);
  });

  it("renders student names, evaluation columns and auto-calculates condition", () => {
    render(<GradeTable enrollments={mockEnrollments} students={mockStudents} />);

    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("Carlos López")).toBeInTheDocument();
    expect(screen.getByText("Midterm Exam")).toBeInTheDocument();
    expect(screen.getAllByText("Aprobando").length).toBeGreaterThan(0);
  });

  it("navigates down on Enter or ArrowDown", () => {
    render(<GradeTable enrollments={mockEnrollments} students={mockStudents} />);

    const cell0 = screen.getByDisplayValue("8.5");
    const cell1 = screen.getByDisplayValue("7");

    const focusSpy = vi.spyOn(cell1, "focus");

    fireEvent.keyDown(cell0, { key: "ArrowDown" });
    expect(focusSpy).toHaveBeenCalled();
  });

  it("navigates up on ArrowUp", () => {
    render(<GradeTable enrollments={mockEnrollments} students={mockStudents} />);

    const cell0 = screen.getByDisplayValue("8.5");
    const cell1 = screen.getByDisplayValue("7");

    const focusSpy = vi.spyOn(cell0, "focus");

    fireEvent.keyDown(cell1, { key: "ArrowUp" });
    expect(focusSpy).toHaveBeenCalled();
  });
});
