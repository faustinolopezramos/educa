from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import EnrollmentStatus, PaymentStatus
from app.schemas.base import PatchModel


class EnrollmentCreate(BaseModel):
    student_id: int
    course_id: int
    status: EnrollmentStatus = EnrollmentStatus.active
    payment_status: PaymentStatus = PaymentStatus.pending


class EnrollmentUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("status", "payment_status")
    status: EnrollmentStatus | None = None
    payment_status: PaymentStatus | None = None
    attendance_blocked: bool | None = None


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    course_id: int
    status: EnrollmentStatus
    payment_status: PaymentStatus
    attendance_blocked: bool
