from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Date
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import SessionStatus


class ClassSession(Base):
    """One occurrence of a weekly `Schedule` on a concrete date.

    This is the grain the academy actually operates on: attendance and grades
    hang off a session (not a bare date), so they always know *which* class of
    *which* schedule they belong to, and time-based reports are just an
    aggregation over the sessions in a range.
    """

    __tablename__ = "class_sessions"
    __table_args__ = (
        UniqueConstraint("schedule_id", "date", name="uq_session_schedule_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedules.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date_type] = mapped_column(Date, index=True)
    status: Mapped[SessionStatus] = mapped_column(
        SqlEnum(SessionStatus, name="session_status"),
        default=SessionStatus.scheduled,
    )
    topic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Why a session was cancelled (holiday, teacher absence, rescheduled…).
    cancel_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # For a make-up class: the (now cancelled) session it replaces.
    origin_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="SET NULL"), nullable=True
    )

    schedule: Mapped["Schedule"] = relationship(back_populates="sessions")
    attendance_records: Mapped[list["Attendance"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    grades: Mapped[list["Grade"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
