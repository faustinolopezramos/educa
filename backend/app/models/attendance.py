from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AttendanceStatus


class Attendance(Base):
    __tablename__ = "attendance"
    # A student is marked once per class session: re-marking corrects the
    # existing row instead of appending a second one that would skew rates.
    __table_args__ = (
        UniqueConstraint(
            "enrollment_id", "session_id", name="uq_attendance_enrollment_session"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[int] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        SqlEnum(AttendanceStatus, name="attendance_status"),
        default=AttendanceStatus.present,
    )

    enrollment: Mapped["Enrollment"] = relationship(back_populates="attendance_records")
    session: Mapped["ClassSession"] = relationship(back_populates="attendance_records")

    @property
    def date(self) -> date_type:
        """The class day, carried on the session this mark belongs to."""
        return self.session.date
