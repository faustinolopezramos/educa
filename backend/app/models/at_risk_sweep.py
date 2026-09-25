from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AtRiskSweep(Base):
    """One weekly at-risk sweep of one academy — the proof that it already ran.

    The unique index is the lock: whoever inserts the row for (academy, week)
    first runs the sweep, and anyone else — a second process, a retry, the next
    hourly check — hits the constraint and skips. `tenant_id` is NULL for
    courses that belong to no academy (single-school installs), hence the
    COALESCE in the index: Postgres never treats two NULLs as equal.
    """

    __tablename__ = "at_risk_sweeps"
    __table_args__ = (
        Index(
            "uq_at_risk_sweeps_tenant_week",
            text("COALESCE(tenant_id, 0)"),
            "week_start",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    week_start: Mapped[date] = mapped_column(Date)
    students_flagged: Mapped[int] = mapped_column(Integer, default=0)
    notifications_sent: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
