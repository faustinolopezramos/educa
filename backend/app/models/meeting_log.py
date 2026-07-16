from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MeetingLog(Base):
    __tablename__ = "meeting_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("virtual_meetings.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    join_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    leave_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)  # seconds

    meeting: Mapped["VirtualMeeting"] = relationship(back_populates="logs")
