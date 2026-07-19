from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    """Append-only trail of who changed what, and from what to what.

    Written alongside sensitive mutations (grades, attendance, enrolment status,
    location approvals, user role changes). Never updated or deleted — a change
    to a grade is exactly the kind of thing an academy must be able to explain
    months later.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Null only for actions with no logged-in actor (e.g. a system job).
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(16))  # create | update | delete
    entity: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
