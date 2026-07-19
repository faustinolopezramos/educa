from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EnrollmentStatus, PaymentStatus


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_enrollment_student_course"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        SqlEnum(EnrollmentStatus, name="enrollment_status"),
        default=EnrollmentStatus.active,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SqlEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending
    )
    attendance_blocked: Mapped[bool] = mapped_column(default=False)

    student: Mapped["User"] = relationship(back_populates="enrollments")
    course: Mapped["Course"] = relationship(back_populates="enrollments")
    attendance_records: Mapped[list["Attendance"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
    grades: Mapped[list["Grade"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
