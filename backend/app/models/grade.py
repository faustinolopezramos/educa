from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Grade(Base):
    """A score for one evaluation of one enrollment.

    A grade is either tied to a class session (`session_id` set — a daily /
    participation grade for that day) or course-level (`session_id` NULL — an
    exam or final that belongs to no single day). Uniqueness is enforced by two
    partial indexes (see the migration): one score per evaluation per session,
    and one per evaluation at course level.
    """

    __tablename__ = "grades"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="CASCADE"), index=True, nullable=True
    )
    evaluation_name: Mapped[str] = mapped_column(String(150))
    score: Mapped[float] = mapped_column(Float)
    # When the score was entered. A session grade can be dated through its
    # session, but a course-level one (exam, final) hangs off no date at all —
    # which left period reports unable to tell this month's exam from last
    # year's, and so mixing every exam ever sat into a weekly report.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    enrollment: Mapped["Enrollment"] = relationship(back_populates="grades")
    session: Mapped["ClassSession | None"] = relationship(back_populates="grades")
