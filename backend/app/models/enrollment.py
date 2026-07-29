from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, Float, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EnrollmentStatus, PaymentStatus


from sqlalchemy import Index, text


class Enrollment(Base):
    """A matrícula/inscripción — the "Código/Carné" the business asks for is
    `enrollment_code`, generated once at creation (see
    `services.sequences.next_enrollment_code`)."""

    __tablename__ = "enrollments"
    __table_args__ = (
        Index(
            "uq_enrollment_student_course_active",
            "student_id",
            "course_id",
            unique=True,
            postgresql_where=text("status != 'withdrawn'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    enrollment_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    status: Mapped[EnrollmentStatus] = mapped_column(
        SqlEnum(EnrollmentStatus, name="enrollment_status"),
        default=EnrollmentStatus.active,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SqlEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending
    )
    # The agreed fee ("cuota") for this enrollment. The Payment ledger's first
    # `charge` row is seeded from this amount so the two never start out of sync.
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    attendance_blocked: Mapped[bool] = mapped_column(default=False)

    student: Mapped["User"] = relationship(back_populates="enrollments")
    course: Mapped["Course"] = relationship(back_populates="enrollments")
    attendance_records: Mapped[list["Attendance"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
    grades: Mapped[list["Grade"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
