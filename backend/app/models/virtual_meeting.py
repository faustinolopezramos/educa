from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import MeetingStatus


class VirtualMeeting(Base):
    __tablename__ = "virtual_meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedules.id", ondelete="CASCADE"), index=True
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("meeting_providers.id", ondelete="RESTRICT"), index=True
    )
    external_meeting_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    join_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    host_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[MeetingStatus] = mapped_column(
        SqlEnum(MeetingStatus, name="meeting_status"), default=MeetingStatus.scheduled
    )
    recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    schedule: Mapped["Schedule"] = relationship(back_populates="meetings")
    provider: Mapped["MeetingProvider"] = relationship(back_populates="meetings")
    logs: Mapped[list["MeetingLog"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
