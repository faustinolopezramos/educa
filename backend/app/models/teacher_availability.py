from __future__ import annotations

from datetime import time

from sqlalchemy import ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TeacherAvailability(Base):
    """A weekly window during which a teacher is available to teach.

    Same weekly-recurring convention as Schedule: day_of_week 0=Mon..6=Sun.
    """

    __tablename__ = "teacher_availabilities"

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Monday .. 6=Sunday
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
