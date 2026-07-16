from pydantic import BaseModel, ConfigDict

from app.models.enums import EnrollmentStatus, PaymentStatus


class EnrollmentCreate(BaseModel):
    student_id: int
    course_id: int
    status: EnrollmentStatus = EnrollmentStatus.active
    payment_status: PaymentStatus = PaymentStatus.pending


class EnrollmentUpdate(BaseModel):
    status: EnrollmentStatus | None = None
    payment_status: PaymentStatus | None = None


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    course_id: int
    status: EnrollmentStatus
    payment_status: PaymentStatus
