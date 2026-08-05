import { describe, it, expect, vi, beforeEach } from "vitest";

import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { EnrollWizard } from "../EnrollWizard";
import * as queries from "../../../lib/queries";
import { createCourse, createUser } from "../../../test/fixtures";

vi.mock("../../../lib/queries");

/**
 * Enrolling is one screen that finishes the job.
 *
 * These replace the tests of the previous design, which asserted a
 * single-student form that offered every course in the academy — including the
 * drafts and closed ones the API now refuses — and counted free seats itself
 * over `status === "active"` while the cupo counts anyone holding a seat.
 */
describe("EnrollWizard", () => {
  let onClose: ReturnType<typeof vi.fn>;
  let bulkMutate: ReturnType<typeof vi.fn>;

  const openCourse = createCourse({
    id: 1,
    name: "English A1",
    status: "open",
    max_students: 20,
    seats_taken: 3,
  });
  const draftCourse = createCourse({
    id: 2,
    name: "English B2 (preparando)",
    status: "draft",
  });
  const closedCourse = createCourse({
    id: 3,
    name: "Francés A1 (terminado)",
    status: "closed",
  });

  const ana = createUser({ id: 10, full_name: "Ana Pérez", email: "ana@test.com" });
  const luis = createUser({ id: 11, full_name: "Luis Gómez", email: "luis@test.com" });

  beforeEach(() => {
    onClose = vi.fn();
    bulkMutate = vi.fn();

    vi.mocked(queries.useCourses).mockReturnValue({
      data: [openCourse, draftCourse, closedCourse],
    } as never);
    vi.mocked(queries.useUsers).mockReturnValue({ data: [ana, luis] } as never);
    vi.mocked(queries.usePublicTeachers).mockReturnValue({ data: [] } as never);
    vi.mocked(queries.useEnrollments).mockReturnValue({ data: [] } as never);
    vi.mocked(queries.useSchedules).mockReturnValue({ data: [] } as never);
    // El wizard pide nacionalidades desde que el alta las recoge. Sin stub, el
    // módulo mockeado devuelve `undefined` y desestructurar `.data` reventaba
    // los ocho casos antes de renderizar nada.
    vi.mocked(queries.useNationalities).mockReturnValue({ data: [] } as never);
    vi.mocked(queries.useCreateUser).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(queries.useBulkEnroll).mockReturnValue({
      mutate: bulkMutate,
      isPending: false,
    } as never);
  });

  it("offers only the courses that would accept somebody", async () => {
    render(<EnrollWizard onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /buscar un curso/i }));

    expect(await screen.findByRole("option", { name: /English A1/ })).toBeInTheDocument();
    // A draft has no timetable and a closed course is over: both are refused by
    // the API, so offering them would be a picker that leads to a 409.
    expect(screen.queryByRole("option", { name: /preparando/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /terminado/ })).not.toBeInTheDocument();
  });

  it("reports free seats from the server count, not its own", async () => {
    render(<EnrollWizard initialCourseId={1} onClose={onClose} />);
    // 20 offered, 3 held → 17. Counting `active` client-side used to promise
    // seats that were already taken.
    expect(await screen.findByText(/17 cupos libres en English A1/)).toBeInTheDocument();
  });

  it("stays blocked until there is at least one student and a course", () => {
    render(<EnrollWizard onClose={onClose} />);
    expect(screen.getByRole("button", { name: /^inscribir$/i })).toBeDisabled();
  });

  it("enrols one student and several through the same flow", async () => {
    render(<EnrollWizard initialCourseId={1} initialStudentIds={[10, 11]} onClose={onClose} />);

    expect(screen.getByText("Inscribir 2 alumnos")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Luis Gómez")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^inscribir$/i }));
    await waitFor(() => expect(bulkMutate).toHaveBeenCalled());
    expect(bulkMutate.mock.calls[0][0]).toMatchObject({
      course_id: 1,
      student_ids: [10, 11],
    });
  });

  it("carries the cuota so finance does not need a second trip", async () => {
    render(<EnrollWizard initialCourseId={1} initialStudentIds={[10]} onClose={onClose} />);

    // Queried by role, not by label: `Field` renders a <label> that is not
    // associated with its control, so `getByLabelText` finds nothing. That gap
    // is app-wide and worth fixing on its own, not as a side effect here.
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: /^inscribir$/i }));

    await waitFor(() => expect(bulkMutate).toHaveBeenCalled());
    expect(bulkMutate.mock.calls[0][0]).toMatchObject({ amount: 350 });
  });

  it("refuses to submit more students than there are seats", () => {
    const tight = createCourse({ id: 1, name: "English A1", status: "open", max_students: 4, seats_taken: 3 });
    vi.mocked(queries.useCourses).mockReturnValue({ data: [tight] } as never);

    render(<EnrollWizard initialCourseId={1} initialStudentIds={[10, 11]} onClose={onClose} />);

    expect(screen.getByRole("button", { name: /^inscribir$/i })).toBeDisabled();
    expect(screen.getByText(/sólo quedan 1 cupos/i)).toBeInTheDocument();
  });

  it("says so when the academy has nothing open to enrol into", () => {
    vi.mocked(queries.useCourses).mockReturnValue({
      data: [draftCourse, closedCourse],
    } as never);

    render(<EnrollWizard onClose={onClose} />);
    expect(screen.getByText(/ningún curso admite matrícula/i)).toBeInTheDocument();
  });

  it("closes on cancel", () => {
    render(<EnrollWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
