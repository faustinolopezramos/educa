from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Date, DateTime, Enum as SqlEnum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import MakeUpStatus


class MakeUpCredit(Base):
    """A make-up recovery credit granted to a student.

    Issued when a class is excused or cancelled, or manually by an academic director.
    Can be redeemed for a seat in a candidate session with matching MCER level and
    available capacity.
    """

    __tablename__ = "make_up_credits"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    origin_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[MakeUpStatus] = mapped_column(
        SqlEnum(MakeUpStatus, name="make_up_status"),
        default=MakeUpStatus.available,
        index=True,
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[date_type] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    enrollment: Mapped["Enrollment"] = relationship(foreign_keys=[enrollment_id])
    origin_session: Mapped["ClassSession | None"] = relationship(
        foreign_keys=[origin_session_id]
    )
    target_session: Mapped["ClassSession | None"] = relationship(
        foreign_keys=[target_session_id]
    )
