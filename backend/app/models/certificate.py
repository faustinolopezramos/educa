from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Certificate(Base):
    """A level-completion certificate issued when a student passes a course.

    One per enrolment. The `code` is a short, unique, shareable identifier for
    verification. The level is snapshotted at issue time so it survives later
    changes to the course.
    """

    __tablename__ = "certificates"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), unique=True, index=True
    )
    level_id: Mapped[int] = mapped_column(ForeignKey("levels.id", ondelete="RESTRICT"))
    final_score: Mapped[float] = mapped_column(Float)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    issued_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    enrollment: Mapped["Enrollment"] = relationship()
