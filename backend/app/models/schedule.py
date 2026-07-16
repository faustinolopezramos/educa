from __future__ import annotations

from datetime import date, time

from sqlalchemy import Date, ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), index=True, nullable=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Monday .. 6=Sunday
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    # Denormalized term bounds copied from the course so conflict detection and
    # the DB exclusion constraint only clash when the terms overlap. NULL = open.
    term_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    term_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="schedules")
    teacher: Mapped["User"] = relationship(
        back_populates="schedules", foreign_keys=[teacher_id]
    )
    room: Mapped["Room | None"] = relationship(back_populates="schedules")
    meetings: Mapped[list["VirtualMeeting"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )
