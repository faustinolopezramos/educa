from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Date
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AttendanceStatus


class Attendance(Base):
    __tablename__ = "attendance"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date_type] = mapped_column(Date)
    status: Mapped[AttendanceStatus] = mapped_column(
        SqlEnum(AttendanceStatus, name="attendance_status"),
        default=AttendanceStatus.present,
    )

    enrollment: Mapped["Enrollment"] = relationship(back_populates="attendance_records")
