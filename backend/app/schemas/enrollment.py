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
