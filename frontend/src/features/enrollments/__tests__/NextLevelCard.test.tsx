import { describe, it, expect, vi, beforeEach } from "vitest";

import { render, screen, fireEvent } from "../../../test/utils";
import { NextLevelCard } from "../NextLevelCard";
import * as queries from "../../../lib/queries";
import type { RenewalOption, RenewalOptions, RenewalRequest } from "../../../lib/types";

vi.mock("../../../lib/queries");

const group = (over: Partial<RenewalOption["courses"][number]> = {}) => ({
  id: 7,
  name: "Inglés A2 — Sabatino",
  start_date: "2026-10-12",
  end_date: "2027-01-10",
  seats_left: 8,
  schedules: [
    { day_of_week: 5, start_time: "09:00:00", end_time: "11:00:00", modality: "presencial" as const },
  ],
  clashes: false,
  ...over,
});

const option = (over: Partial<RenewalOption> = {}): RenewalOption => ({
  from_enrollment_id: 3,
  from_course_name: "Inglés A1",
  current_level_name: "Principiante A1",
  next_level_name: "Elemental A2",
  amount: 500,
  courses: [group()],
  request: null,
  ...over,
});

const request = (over: Partial<RenewalRequest> = {}): RenewalRequest => ({
  id: 99,
  student_id: 1,
  student_name: "Ana",
  from_enrollment_id: 3,
  from_course_name: "Inglés A1",
  course_id: 7,
  course_name: "Inglés A2 — Sabatino",
  level_name: "Elemental A2",
  status: "pending",
  amount: 500,
  review_note: null,
  enrollment_id: null,
  created_at: "2026-09-25T10:00:00Z",
  reviewed_at: null,
  ...over,
});

function withOptions(data: RenewalOptions) {
  vi.mocked(queries.useRenewalOptions).mockReturnValue({ data } as never);
}

describe("NextLevelCard", () => {
  let requestMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestMutate = vi.fn();
    vi.mocked(queries.useRequestRenewal).mockReturnValue({
      mutate: requestMutate,
      isPending: false,
    } as never);
    vi.mocked(queries.useWithdrawRenewal).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it("stays out of the way when there is nothing to renew", () => {
    withOptions({ blocked_reason: null, options: [] });
    const { container } = render(<NextLevelCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the open groups and asks with the same cuota after confirming", () => {
    withOptions({ blocked_reason: null, options: [option()] });
    render(<NextLevelCard />);

    expect(screen.getByText("Elemental A2")).toBeInTheDocument();
    expect(screen.getByText(/Sábado 09:00–11:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pedir plaza" }));
    expect(screen.getByText(/Q500.00/)).toBeInTheDocument();
    expect(screen.getByText(/no se te\s+cobra nada/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect(requestMutate).toHaveBeenCalledWith(
      { from_enrollment_id: 3, course_id: 7 },
      expect.anything(),
    );
  });

  it("will not let a student ask for a full group or one that clashes", () => {
    withOptions({
      blocked_reason: null,
      options: [
        option({
          courses: [group({ id: 1, seats_left: 0 }), group({ id: 2, name: "Dominical", clashes: true })],
        }),
      ],
    });
    render(<NextLevelCard />);
    for (const button of screen.getAllByRole("button", { name: "Pedir plaza" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText("Sin cupo")).toBeInTheDocument();
    expect(screen.getByText("Choca con otra de tus clases")).toBeInTheDocument();
  });

  it("shows a pending request instead of the groups", () => {
    withOptions({ blocked_reason: null, options: [option({ request: request() })] });
    render(<NextLevelCard />);
    expect(screen.getByText(/Esperando confirmación/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pedir plaza" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar solicitud" })).toBeInTheDocument();
  });

  it("explains a rejection and lets the student choose again", () => {
    withOptions({
      blocked_reason: null,
      options: [
        option({ request: request({ status: "rejected", review_note: "ese grupo se cierra" }) }),
      ],
    });
    render(<NextLevelCard />);
    expect(screen.getByText(/ese grupo se cierra/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pedir plaza" })).toBeEnabled();
  });

  it("asks a delinquent student to pay first", () => {
    withOptions({ blocked_reason: "delinquent", options: [option()] });
    render(<NextLevelCard />);
    expect(screen.getByText(/Ponte al día con tus pagos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pedir plaza" })).not.toBeInTheDocument();
  });
});
