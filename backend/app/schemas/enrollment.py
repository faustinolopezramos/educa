from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import EnrollmentStatus, PaymentStatus
from app.schemas.base import PatchModel


class EnrollmentCreate(BaseModel):
    student_id: int
    course_id: int
    status: EnrollmentStatus = EnrollmentStatus.active
    payment_status: PaymentStatus = PaymentStatus.pending
    # The agreed fee ("cuota"). Optional: an admin may set it later via PATCH.
    amount: float = Field(default=0.0, ge=0)
    # When that cuota falls due. Copied onto the ledger's opening charge; with
    # no date the debt is open-ended and never becomes delinquent by itself.
    due_date: date | None = None


class EnrollmentUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("status", "payment_status", "amount")
    status: EnrollmentStatus | None = None
    payment_status: PaymentStatus | None = None
    attendance_blocked: bool | None = None
    amount: float | None = Field(default=None, ge=0)


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    course_id: int
    enrollment_code: str
    status: EnrollmentStatus
    payment_status: PaymentStatus
    attendance_blocked: bool
    amount: float
    # `charged − paid` from the ledger, so the list can show what is owed
    # instead of only whether it is late. Populated by `attach_balances`;
    # defaulted so a lone enrollment built without it still serialises.
    balance: float = 0.0


class BulkEnrollRequest(BaseModel):
    """Seat several students in one course in a single pass."""

    course_id: int
    student_ids: list[int] = Field(min_length=1, max_length=200)
    amount: float = Field(default=0.0, ge=0)
    due_date: date | None = None
    #: Enrol despite a timetable clash, the same override the single endpoint has.
    force: bool = False


class BulkEnrollOutcome(BaseModel):
    """What happened to one student in the batch."""

    student_id: int
    student_name: str
    ok: bool
    enrollment_id: int | None = None
    enrollment_code: str | None = None
    reason: str | None = None


class BulkEnrollResult(BaseModel):
    """Per-student outcomes, not all-or-nothing.

    Seating thirty students where two clash is twenty-eight successes and two
    problems to look at — rolling the whole batch back would make the admin
    hunt for the two by hand and repeat the other twenty-eight.
    """

    created: int
    failed: int
    outcomes: list[BulkEnrollOutcome]
